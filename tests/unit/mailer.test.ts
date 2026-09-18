import { afterEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { parseMailbox } from "@/lib/mail-address";
import { createMailer, FileMailer, SmtpMailer } from "@/server/mail/mailer";
import { FakeSmtpServer } from "../support/fake-smtp";

const USER = "sehati@sehati.example";
const PASSWORD = "kata-sandi-rahasia";

const servers: FakeSmtpServer[] = [];
const mailers: SmtpMailer[] = [];

async function setup(mode?: "normal" | "silent" | "reject-rcpt", password = PASSWORD) {
  const server = new FakeSmtpServer({ user: USER, password: PASSWORD, mode });
  servers.push(server);
  const port = await server.start();
  const mailer = new SmtpMailer({
    host: "127.0.0.1",
    port,
    secure: false,
    user: USER,
    password,
    from: `Sehati <${USER}>`,
    allowPlaintext: true,
    timeouts: { connectionMs: 1000, greetingMs: 500, socketMs: 2000 },
  });
  mailers.push(mailer);
  return { server, mailer };
}

afterEach(async () => {
  for (const mailer of mailers.splice(0)) mailer.close();
  for (const server of servers.splice(0)) await server.stop();
});

describe("SMTP mail driver", () => {
  it("authenticates and delivers the message", async () => {
    const { server, mailer } = await setup();
    await mailer.send({ to: "putri@example.test", subject: "Atur ulang password kamu", text: "Halo Putri,\nTautan: https://sehati.example/reset-password?token=abc" });

    expect(server.received).toHaveLength(1);
    const [mail] = server.received;
    expect(mail!.authUser).toBe(USER);
    expect(mail!.from).toBe(USER);
    expect(mail!.to).toEqual(["putri@example.test"]);
    expect(mail!.data).toMatch(/^From: Sehati <sehati@sehati\.example>\r$/m);
    expect(mail!.data).toMatch(/^To: putri@example\.test\r$/m);
    expect(mail!.data).toMatch(/^Subject: Atur ulang password kamu\r$/m);
    expect(mail!.data).toMatch(/^Auto-Submitted: auto-generated\r$/m);
    expect(mail!.data).toContain("https://sehati.example/reset-password?token=abc");
  });

  it("verify() authenticates without sending", async () => {
    const { server, mailer } = await setup();
    await mailer.verify();
    expect(server.authAttempts).toEqual([USER]);
    expect(server.received).toEqual([]);
  });

  it("rejects a wrong password without echoing it", async () => {
    const { server, mailer } = await setup("normal", "salah-sekali");
    const error = await mailer.send({ to: "putri@example.test", subject: "x", text: "y" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toMatch(/535/);
    expect(JSON.stringify(error)).not.toContain("salah-sekali");
    expect(server.received).toEqual([]);
  });

  it("surfaces a refused recipient", async () => {
    const { mailer } = await setup("reject-rcpt");
    await expect(mailer.send({ to: "nobody@example.test", subject: "x", text: "y" })).rejects.toThrow(/550|recipients/i);
  });

  it("gives up on a server that never greets", async () => {
    const { mailer } = await setup("silent");
    const started = Date.now();
    await expect(mailer.send({ to: "putri@example.test", subject: "x", text: "y" })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("cannot be tricked into extra headers or recipients", async () => {
    const { server, mailer } = await setup();
    await mailer.send({ to: "putri@example.test", subject: "Halo\r\nBcc: attacker@evil.test", text: "isi" });
    const [mail] = server.received;
    expect(mail!.to).toEqual(["putri@example.test"]);
    expect(mail!.data).not.toMatch(/^Bcc:/im);
  });
});

describe("mail configuration", () => {
  const base = { DATABASE_URL: "postgresql://localhost/x" };
  const smtp = {
    ...base,
    MAIL_DRIVER: "smtp",
    SMTP_HOST: "mail.sehati.example",
    SMTP_USER: USER,
    SMTP_PASSWORD: PASSWORD,
    MAIL_FROM: `Sehati <${USER}>`,
  };

  it("defaults to the file driver", () => {
    expect(createMailer(parseEnv(base))).toBeInstanceOf(FileMailer);
  });

  it("builds the SMTP driver with implicit TLS on 465", () => {
    const env = parseEnv(smtp);
    expect(env.SMTP_PORT).toBe(465);
    const mailer = createMailer(env);
    expect(mailer).toBeInstanceOf(SmtpMailer);
    (mailer as SmtpMailer).close();
  });

  it("rejects an incomplete SMTP setup and names variables only", () => {
    expect(() => parseEnv({ ...smtp, SMTP_PASSWORD: "", MAIL_FROM: undefined })).toThrow(
      "Invalid environment configuration: SMTP_PASSWORD, MAIL_FROM",
    );
    expect(() => parseEnv({ ...smtp, MAIL_FROM: "Sehati <nope>" })).toThrow("MAIL_FROM");
    expect(() => parseEnv({ ...smtp, SMTP_PORT: "abc" })).toThrow("SMTP_PORT");
    try {
      parseEnv({ ...smtp, SMTP_HOST: "" });
    } catch (error) {
      expect(String(error)).not.toContain(PASSWORD);
    }
  });

  it("parses sender mailboxes", () => {
    expect(parseMailbox("Sehati <Sehati@Wuzzgate.my.id>")).toEqual({ name: "Sehati", address: "sehati@wuzzgate.my.id" });
    expect(parseMailbox('"Tim Sehati" <halo@sehati.example>')).toEqual({ name: "Tim Sehati", address: "halo@sehati.example" });
    expect(parseMailbox("halo@sehati.example")).toEqual({ name: null, address: "halo@sehati.example" });
    expect(parseMailbox("halo@sehati.example\r\nBcc: x@y.z")).toBeNull();
    expect(parseMailbox("Sehati")).toBeNull();
    expect(parseMailbox("")).toBeNull();
  });
});
