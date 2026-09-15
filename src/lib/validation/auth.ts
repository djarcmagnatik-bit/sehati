import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound protects the password hasher from oversized input. */
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email wajib diisi")
  .max(254, "Email terlalu panjang")
  .pipe(z.email("Format email tidak valid"));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password minimal ${PASSWORD_MIN_LENGTH} karakter`)
  .max(PASSWORD_MAX_LENGTH, `Password maksimal ${PASSWORD_MAX_LENGTH} karakter`);

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi").max(80, "Nama maksimal 80 karakter"),
    email: emailSchema,
    password: newPasswordSchema,
    passwordConfirmation: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirmation) {
      ctx.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "Konfirmasi password tidak sama" });
    }
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi").max(PASSWORD_MAX_LENGTH, "Password tidak valid"),
  remember: z.boolean(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, "Tautan reset tidak valid").max(128, "Tautan reset tidak valid"),
    password: newPasswordSchema,
    passwordConfirmation: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirmation) {
      ctx.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "Konfirmasi password tidak sama" });
    }
  });

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
