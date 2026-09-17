import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { isPwaIconVariant, PWA_ICON_VARIANTS } from "@/lib/pwa";

type Classify = (url: URL, request: { method: string; mode: string; headers: Headers }, origin: string) => string;

/** Loads public/sw.js in an isolated context and returns its request classifier. */
function loadClassifier(): { classify: Classify; listeners: string[] } {
  const listeners: string[] = [];
  const context = vm.createContext({
    URL,
    self: { addEventListener: (type: string) => listeners.push(type), location: { origin: "https://app.test" } },
  });
  vm.runInContext(readFileSync(path.resolve(import.meta.dirname, "../../public/sw.js"), "utf8"), context);
  return { classify: context["classifyRequest"] as Classify, listeners };
}

describe("service worker caching rules", () => {
  const { classify, listeners } = loadClassifier();
  const origin = "https://app.test";
  const request = (overrides: Partial<{ method: string; mode: string; headers: Record<string, string> }> = {}) => ({
    method: overrides.method ?? "GET",
    mode: overrides.mode ?? "cors",
    headers: new Headers(overrides.headers ?? {}),
  });
  const kind = (href: string, overrides?: Parameters<typeof request>[0]) => classify(new URL(href, origin), request(overrides), origin);

  it("registers install, activate and fetch handlers", () => {
    expect(listeners.sort()).toEqual(["activate", "fetch", "install"]);
  });

  it("caches only hashed build assets and the public app shell", () => {
    expect(kind("/_next/static/chunks/app-123.js")).toBe("static");
    expect(kind("/_next/static/media/font.woff2")).toBe("static");
    expect(kind("/manifest.webmanifest")).toBe("shell");
    expect(kind("/pwa-icon/192")).toBe("shell");
  });

  it("never caches pages, data, media, payments or other origins", () => {
    for (const href of ["/api/payments/webhook/sandbox", "/media/abc", "/i/token", "/budget", "/_next/image?url=x", "/sw.js"]) {
      expect(kind(href)).toBe("bypass");
    }
    expect(kind("/_next/static/chunks/app.js", { method: "POST" })).toBe("bypass");
    expect(kind("/dashboard?_rsc=abc")).toBe("bypass");
    expect(kind("/dashboard", { headers: { RSC: "1" } })).toBe("bypass");
    expect(classify(new URL("https://cdn.example/_next/static/x.js"), request(), origin)).toBe("bypass");
  });

  it("routes page loads through the network with the offline fallback", () => {
    expect(kind("/dashboard", { mode: "navigate" })).toBe("navigate");
    // A Server Action posts to the page URL: never intercepted.
    expect(kind("/dashboard", { mode: "navigate", method: "POST" })).toBe("bypass");
  });
});

describe("web app manifest", () => {
  it("describes an installable standalone app with any and maskable icons", () => {
    const data = manifest();
    expect(data).toMatchObject({ short_name: "Sehati", start_url: "/dashboard", scope: "/", display: "standalone", lang: "id" });
    const icons = data.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(isPwaIconVariant(icon.src.replace("/pwa-icon/", ""))).toBe(true);
    expect(PWA_ICON_VARIANTS["maskable-512"]).toEqual({ size: 512, maskable: true });
  });
});
