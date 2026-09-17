import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { extensionMatchesType, stripImageMetadata } from "@/lib/image-metadata";
import { readImageInfo } from "@/lib/media";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security-headers";
import { SECTION_CONTENT_SCHEMAS } from "@/lib/validation/invitation";
import { instagramUrl } from "@/lib/vendors";
import { inspectZip, ZIP_MAX_UNCOMPRESSED_BYTES } from "@/lib/zip-inspect";
import { jpegHeaderFixture, jpegWithExifFixture as jpegWithExif, pngFixture } from "../support/image-fixtures";

const ROOT = path.resolve(import.meta.dirname, "../..");

// ─── Content Security Policy ─────────────────────────────────────────────────

describe("content security policy", () => {
  const policy = (isDev = false) =>
    Object.fromEntries(
      buildContentSecurityPolicy({ nonce: "abc123", isDev })
        .split("; ")
        .map((directive) => {
          const [name, ...values] = directive.split(" ");
          return [name!, values];
        }),
    );

  it("only runs scripts carrying the request nonce", () => {
    const csp = policy();
    expect(csp["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(policy(true)["script-src"]).toContain("'unsafe-eval'");
  });

  it("forbids framing, plugins, base hijacking and foreign form targets", () => {
    const csp = policy();
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'", "https://app.midtrans.com", "https://app.sandbox.midtrans.com"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
  });

  it("creates unpredictable nonces", () => {
    const nonces = new Set(Array.from({ length: 200 }, createNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

// ─── Client IP for rate limits ───────────────────────────────────────────────

describe("client IP behind proxies", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("ignores the client-controlled part of X-Forwarded-For", () => {
    // The client sent "6.6.6.6"; the one trusted proxy appended the real address.
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9");
  });

  it("trusts nothing without a configured proxy, and rejects garbage", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.9" }), 0)).toBeNull();
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.9" }), 2)).toBeNull();
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "not-an-ip" }), 1)).toBeNull();
    expect(clientIpFromHeaders(headers({ "x-real-ip": "2001:db8::1" }), 1)).toBe("2001:db8::1");
    expect(clientIpFromHeaders(headers({}), 1)).toBeNull();
  });
});

// ─── Upload hardening ────────────────────────────────────────────────────────

function pngWithText(): Buffer {
  const png = pngFixture(300, 200);
  const data = Buffer.from("Location\0Jl. Rahasia 12, Bandung", "binary");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // The CRC is not checked by the stripper; zeros keep the fixture short.
  const text = Buffer.concat([length, Buffer.from("tEXt", "ascii"), data, Buffer.alloc(4)]);
  return Buffer.concat([png.subarray(0, 33), text, png.subarray(33)]);
}

function webpWithExif(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32LE(data.length, 4);
    return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04 | 0x20; // EXIF + XMP + ICC
  vp8x.writeUIntLE(639, 4, 3);
  vp8x.writeUIntLE(479, 7, 3);
  const body = Buffer.concat([
    chunk("VP8X", vp8x),
    chunk("ICCP", Buffer.from("icc")),
    chunk("VP8 ", Buffer.from([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01])),
    chunk("EXIF", Buffer.from("GPS-6.91,107.60")),
    chunk("XMP ", Buffer.from("<x:xmpmeta>secret</x:xmpmeta>")),
  ]);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

const has = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text, "binary"));

describe("image metadata stripping", () => {
  it("drops EXIF, GPS and comments from JPEG but keeps orientation and pixels", () => {
    const original = jpegWithExif(6);
    expect(has(original, "GPS-6.914744")).toBe(true);
    const cleaned = stripImageMetadata(original, "image/jpeg")!;
    expect(has(cleaned, "GPS-")).toBe(false);
    expect(has(cleaned, "Jl. Rahasia")).toBe(false);
    expect(has(cleaned, "JFIF")).toBe(true);
    // A minimal EXIF block with only Orientation = 6 remains.
    const exifAt = Buffer.from(cleaned).indexOf(Buffer.from("Exif\0\0", "binary"));
    expect(exifAt).toBeGreaterThan(0);
    expect(Buffer.from(cleaned).readUInt16BE(exifAt + 6 + 18)).toBe(6);
    expect(Buffer.from(cleaned).subarray(-7).equals(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]))).toBe(true);
    expect(readImageInfo(cleaned)).toEqual({ mimeType: "image/jpeg", width: 800, height: 600 });

    const upright = stripImageMetadata(jpegWithExif(1), "image/jpeg")!;
    expect(has(upright, "Exif")).toBe(false);
    expect(stripImageMetadata(jpegHeaderFixture(), "image/jpeg")).not.toBeNull();
  });

  it("drops PNG text chunks and keeps the image chunks", () => {
    const original = pngWithText();
    expect(readImageInfo(original)).toMatchObject({ width: 300, height: 200 });
    const cleaned = stripImageMetadata(original, "image/png")!;
    expect(has(cleaned, "tEXt")).toBe(false);
    expect(has(cleaned, "Rahasia")).toBe(false);
    expect(Buffer.from(cleaned).equals(pngFixture(300, 200))).toBe(true);
  });

  it("drops WebP EXIF/XMP chunks and fixes the container header", () => {
    const cleaned = Buffer.from(stripImageMetadata(webpWithExif(), "image/webp")!);
    expect(has(cleaned, "GPS")).toBe(false);
    expect(has(cleaned, "xmpmeta")).toBe(false);
    expect(has(cleaned, "ICCP")).toBe(true);
    expect(cleaned.readUInt32LE(4)).toBe(cleaned.length - 8);
    expect(cleaned[20]! & 0x0c).toBe(0);
    expect(cleaned[20]! & 0x20).toBe(0x20);
  });

  it("refuses files whose structure contradicts their type", () => {
    expect(stripImageMetadata(Buffer.from("not an image at all"), "image/jpeg")).toBeNull();
    expect(stripImageMetadata(Buffer.concat([pngFixture().subarray(0, 40)]), "image/png")).toBeNull();
    const truncated = jpegWithExif(6).subarray(0, 30);
    expect(stripImageMetadata(truncated, "image/jpeg")).toBeNull();
  });

  it("refuses file extensions that contradict the content", () => {
    expect(extensionMatchesType("foto.JPG", "image/jpeg")).toBe(true);
    expect(extensionMatchesType("C:\\Users\\a\\foto.webp", "image/webp")).toBe(true);
    expect(extensionMatchesType("foto", "image/png")).toBe(true);
    expect(extensionMatchesType("shell.php", "image/jpeg")).toBe(false);
    expect(extensionMatchesType("foto.png.exe", "image/png")).toBe(false);
    expect(extensionMatchesType("lagu.m4a", "audio/mp4")).toBe(true);
    expect(extensionMatchesType("lagu.mp3", "audio/ogg")).toBe(false);
  });
});

describe("spreadsheet archive inspection", () => {
  it("accepts a real XLSX file", async () => {
    const xlsx = await writeXlsxFile([["Nama", "Kursi"], ["Ahmad", 4]]).toBuffer();
    expect(inspectZip(xlsx)).toBeNull();
  });

  it("refuses archives that declare a huge uncompressed size, and non-archives", () => {
    const entry = Buffer.alloc(46 + 5);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt32LE(ZIP_MAX_UNCOMPRESSED_BYTES + 1, 24);
    entry.writeUInt16LE(5, 28);
    entry.write("a.xml", 46, "ascii");
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(entry.length, 12);
    end.writeUInt32LE(4, 16);
    const bomb = Buffer.concat([Buffer.from("PK\x03\x04", "binary"), entry, end]);
    expect(inspectZip(bomb)).toBe("too_large");

    end.writeUInt16LE(0xffff, 10);
    expect(inspectZip(Buffer.concat([Buffer.from("PK\x03\x04", "binary"), entry, end]))).toBe("zip64");
    expect(inspectZip(Buffer.from("PK\x03\x04 but nothing else"))).toBe("not_zip");
  });
});

// ─── Output encoding of user links ───────────────────────────────────────────

describe("user-provided links", () => {
  it("accepts only real Instagram handles in the public couple section", () => {
    const parse = (brideInstagram: string) => SECTION_CONTENT_SCHEMAS.COUPLE.safeParse({ brideInstagram });
    expect(parse("@putri.ayu").data?.brideInstagram).toBe("putri.ayu");
    expect(parse("https://instagram.com/putri_ayu/").data?.brideInstagram).toBe("putri_ayu");
    expect(parse("javascript:alert(1)").success).toBe(false);
    expect(parse("evil.example/phish?x=1").success).toBe(false);
    expect(instagramUrl("../../evil")).toBeNull();
  });
});

// ─── Static guards over the source tree ──────────────────────────────────────

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(ROOT, file).replace(/\\/g, "/");

describe("source code guards", () => {
  const files = sourceFiles(path.join(ROOT, "src"));

  it("never builds SQL from strings, injects raw HTML or evaluates code", () => {
    const offenders = files.filter((file) =>
      /\$queryRawUnsafe|\$executeRawUnsafe|Prisma\.raw\(|dangerouslySetInnerHTML|\beval\(|new Function\(/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it("checks the session in every Server Action except the public ones", () => {
    const PUBLIC_ACTIONS = new Set([
      "auth-actions.ts:registerAction",
      "auth-actions.ts:loginAction",
      "auth-actions.ts:forgotPasswordAction",
      "auth-actions.ts:resetPasswordAction",
      "auth-actions.ts:logoutAction",
      "public-actions.ts:submitRsvpAction",
      "public-actions.ts:submitWishAction",
    ]);
    const unguarded: string[] = [];
    for (const file of files.filter((candidate) => readFileSync(candidate, "utf8").startsWith('"use server"'))) {
      const source = readFileSync(file, "utf8");
      const starts = [...source.matchAll(/export async function (\w+)\s*\(/g)];
      starts.forEach((match, index) => {
        const body = source.slice(match.index, starts[index + 1]?.index ?? source.length);
        const key = `${path.basename(file)}:${match[1]}`;
        if (!/requireSession\(|getCurrentSession\(/.test(body) && !PUBLIC_ACTIONS.has(key)) unguarded.push(key);
      });
    }
    expect(unguarded).toEqual([]);
  });

  it("authenticates every route handler that is not public by design", () => {
    const PUBLIC_ROUTES: Record<string, RegExp> = {
      // Signature-verified by the payment provider.
      "src/app/api/payments/webhook/[provider]/route.ts": /parseNotification\(/,
      // Bearer secret, disabled when unset.
      "src/app/api/jobs/run/route.ts": /timingSafeEqual\(/,
      // Access decided per asset (published invitation or wedding member).
      "src/app/media/[assetId]/route.ts": /getAssetForDelivery\(/,
      // A fixed CSV header row, no wedding data.
      "src/app/(app)/guests/import/template/route.ts": /IMPORT_TEMPLATE_CSV/,
      // Static brand icons.
      "src/app/pwa-icon/[variant]/route.tsx": /ImageResponse/,
    };
    const routes = files.filter((file) => /route\.tsx?$/.test(file));
    expect(routes.length).toBeGreaterThanOrEqual(7);
    for (const file of routes) {
      const source = readFileSync(file, "utf8");
      const rule = PUBLIC_ROUTES[relative(file)];
      expect(rule ? rule.test(source) : /requireSession\(/.test(source), relative(file)).toBe(true);
    }
  });

  it("opens external links without giving the new page access to this window", () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gs)].filter((match) => !/rel="[^"]*noopener/.test(match[0])).map(() => relative(file));
    });
    expect(offenders).toEqual([]);
  });
});
