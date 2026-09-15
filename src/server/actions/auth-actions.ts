"use server";

import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/redirect";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { authenticateUser, registerUser } from "@/server/auth/auth-service";
import { requestPasswordReset, resetPassword } from "@/server/auth/password-reset-service";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { getRequestContext } from "@/server/auth/request-context";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/server/auth/session-cookie";
import { createSession, revokeSessionByToken } from "@/server/auth/session-service";
import { getMailer } from "@/server/mail/mailer";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang kamu isi.";
const TOO_MANY_ATTEMPTS = "Terlalu banyak percobaan. Silakan coba lagi beberapa menit lagi.";
const INVALID_RESET_LINK = "Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.";

function ipKey(ipAddress: string | null): string {
  return ipAddress ?? "unknown";
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = {
    name: readString(formData, "name"),
    email: readString(formData, "email"),
    password: readString(formData, "password"),
    passwordConfirmation: readString(formData, "passwordConfirmation"),
  };
  const values = { name: input.name, email: input.email };
  // e.g. back to a partner invitation after signing up.
  const next = safeRedirectPath(readString(formData, "next"), "/onboarding");

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }

  try {
    const context = await getRequestContext();
    const limit = await consumeRateLimit(`register:ip:${ipKey(context.ipAddress)}`, RATE_LIMITS.registerPerIp);
    if (!limit.allowed) return { status: "error", message: TOO_MANY_ATTEMPTS, values };

    const result = await registerUser(parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message: INVALID_INPUT,
        fieldErrors: { email: ["Email sudah terdaftar. Silakan masuk."] },
        values,
      };
    }

    const session = await createSession(result.userId, { remember: false, ...context });
    await setSessionCookie(session.token, session.expiresAt, false);
  } catch (error) {
    logger.error("auth.register_failed", { error });
    return { status: "error", message: "Pendaftaran belum berhasil. Silakan coba lagi.", values };
  }

  redirect(next);
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = {
    email: readString(formData, "email"),
    password: readString(formData, "password"),
    remember: formData.get("remember") === "on",
  };
  const values = { email: input.email, remember: input.remember ? "on" : "" };
  const next = safeRedirectPath(readString(formData, "next"));

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }

  try {
    const context = await getRequestContext();
    const ipLimit = await consumeRateLimit(`login:ip:${ipKey(context.ipAddress)}`, RATE_LIMITS.loginPerIp);
    const emailLimit = await consumeRateLimit(`login:email:${parsed.data.email}`, RATE_LIMITS.loginPerEmail);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      logger.warn("auth.login_rate_limited", { ipAddress: context.ipAddress });
      return { status: "error", message: TOO_MANY_ATTEMPTS, values };
    }

    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) return { status: "error", message: "Email atau password salah.", values };

    const session = await createSession(user.id, { remember: parsed.data.remember, ...context });
    await setSessionCookie(session.token, session.expiresAt, parsed.data.remember);
  } catch (error) {
    logger.error("auth.login_failed", { error });
    return { status: "error", message: "Belum berhasil masuk. Silakan coba lagi.", values };
  }

  redirect(next);
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = { email: readString(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values: input };
  }

  try {
    const context = await getRequestContext();
    const ipLimit = await consumeRateLimit(`forgot:ip:${ipKey(context.ipAddress)}`, RATE_LIMITS.forgotPasswordPerIp);
    const emailLimit = await consumeRateLimit(`forgot:email:${parsed.data.email}`, RATE_LIMITS.forgotPasswordPerEmail);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return { status: "error", message: TOO_MANY_ATTEMPTS, values: input };
    }
    await requestPasswordReset(parsed.data.email, { mailer: getMailer(), appUrl: getEnv().APP_URL });
  } catch (error) {
    // Same response as success: the page must not reveal whether the account exists.
    logger.error("auth.forgot_password_failed", { error });
  }

  return {
    status: "success",
    message: "Jika email tersebut terdaftar, kami telah mengirim tautan untuk mengatur ulang password.",
    values: input,
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = {
    token: readString(formData, "token"),
    password: readString(formData, "password"),
    passwordConfirmation: readString(formData, "passwordConfirmation"),
  };

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromZod(parsed.error);
    if (fieldErrors.token) return { status: "error", message: INVALID_RESET_LINK };
    return { status: "error", message: INVALID_INPUT, fieldErrors };
  }

  try {
    const context = await getRequestContext();
    const limit = await consumeRateLimit(`reset:ip:${ipKey(context.ipAddress)}`, RATE_LIMITS.resetPasswordPerIp);
    if (!limit.allowed) return { status: "error", message: TOO_MANY_ATTEMPTS };

    const result = await resetPassword(parsed.data.token, parsed.data.password);
    if (!result.ok) return { status: "error", message: INVALID_RESET_LINK };
    await clearSessionCookie();
  } catch (error) {
    logger.error("auth.reset_password_failed", { error });
    return { status: "error", message: "Password belum berhasil diubah. Silakan coba lagi." };
  }

  redirect("/login?reset=1");
}

export async function logoutAction(): Promise<void> {
  try {
    const token = await readSessionToken();
    if (token) await revokeSessionByToken(token);
  } catch (error) {
    logger.error("auth.logout_revoke_failed", { error });
  }
  await clearSessionCookie();
  redirect("/login");
}
