import { describe, expect, it } from "vitest";
import { zonedTimeToUtcMs } from "@/lib/dates";
import {
  absoluteUrl,
  guestInvitationPath,
  invitationPath,
  RESERVED_SLUGS,
  slugError,
  slugify,
  suggestSlug,
  whatsappShareUrl,
} from "@/lib/invitation";
import { SECTION_FIELDS } from "@/lib/invitation-fields";
import {
  CARD_STYLES,
  COVER_LAYOUTS,
  DEFAULT_THEME_CODE,
  getTheme,
  INVITATION_THEMES,
  isThemeCode,
  PHOTO_SHAPES,
  THEME_MOTIFS,
  CORNER_ARTS,
  themeLook,
  themeStyle,
} from "@/lib/invitation-themes";
import { mapEmbedUrl, mapsLink } from "@/lib/maps";
import { imageRejection, readImageInfo } from "@/lib/media";
import {
  parseSectionContent,
  sectionContentFields,
  weddingEventSchema,
  giftAccountSchema,
  invitationSettingsSchema,
  invitationThemeSchema,
  loveStoryEntrySchema,
} from "@/lib/validation/invitation";
import { jpegHeaderFixture, pngFixture, webpHeaderFixture } from "../support/image-fixtures";

describe("slugs", () => {
  it("folds names into a URL-safe slug", () => {
    expect(slugify("Fajar & Putri!")).toBe("fajar-putri");
    expect(slugify("  Ayu   Lestari  ")).toBe("ayu-lestari");
    expect(slugify("Café Niña")).toBe("cafe-nina");
    expect(slugify("---")).toBe("");
  });

  it("suggests a slug from both names", () => {
    expect(suggestSlug("Putri", "Fajar")).toBe("putri-fajar");
    expect(suggestSlug("A", "")).toBe("a-wedding");
  });

  it("rejects short, malformed and reserved slugs", () => {
    expect(slugError("ab")).toMatch(/minimal 3/);
    expect(slugError("Putri-Fajar")).toMatch(/huruf kecil/);
    expect(slugError("putri--fajar")).toMatch(/huruf kecil/);
    expect(slugError("a".repeat(61))).toMatch(/maksimal 60/);
    expect(slugError("login")).toMatch(/dipakai sistem/);
    expect(slugError("putri-fajar")).toBeNull();
    expect(RESERVED_SLUGS).toContain("undangan");
  });

  it("builds public links", () => {
    expect(invitationPath("putri-fajar")).toBe("/undangan/putri-fajar");
    expect(guestInvitationPath("abc123")).toBe("/i/abc123");
    expect(absoluteUrl("http://localhost:3000/", "/undangan/x")).toBe("http://localhost:3000/undangan/x");
    expect(whatsappShareUrl("Halo & selamat")).toBe("https://wa.me/?text=Halo%20%26%20selamat");
  });
});

describe("themes", () => {
  it("ships the PRD themes with unique codes", () => {
    expect(INVITATION_THEMES.length).toBeGreaterThanOrEqual(9);
    expect(new Set(INVITATION_THEMES.map((theme) => theme.code)).size).toBe(INVITATION_THEMES.length);
    expect(INVITATION_THEMES.map((theme) => theme.code)).toContain("javanese");
  });

  it("falls back to the default theme for an unknown code", () => {
    expect(getTheme("does-not-exist").code).toBe(DEFAULT_THEME_CODE);
    expect(isThemeCode("does-not-exist")).toBe(false);
    expect(isThemeCode("elegant")).toBe(true);
  });

  it("exposes every token as a CSS variable", () => {
    const style = themeStyle(getTheme("elegant"));
    expect(style["--inv-accent"]).toBe(getTheme("elegant").tokens.accent);
    expect(Object.keys(style).every((key) => key.startsWith("--inv-"))).toBe(true);
  });

  it("uses only valid cover layouts as defaults", () => {
    for (const theme of INVITATION_THEMES) {
      expect(COVER_LAYOUTS).toContain(theme.defaultCoverLayout);
    }
  });

  it("keeps the original look for themes without a style", () => {
    expect(themeLook(getTheme("elegant"))).toEqual({
      headingWeight: 600,
      headingStyle: "normal",
      headingCase: "none",
      headingTracking: "normal",
      labelFont: getTheme("elegant").tokens.bodyFont,
      card: "soft",
      photo: "rounded",
      motif: "line",
      grain: false,
      corners: "none",
      motifColor: getTheme("elegant").tokens.accent,
    });
    const style = themeStyle(getTheme("elegant"));
    expect(style["--inv-card-border"]).toBe("1px solid var(--inv-border)");
    expect(style["--inv-heading-weight"]).toBe("600");
  });

  it("ships the 2026 themes with valid styles", () => {
    for (const code of ["editorial", "coquette", "pop", "butter", "film", "boho", "dusty-blue", "sunda"]) {
      const look = themeLook(getTheme(code));
      expect(getTheme(code).code).toBe(code);
      expect(CARD_STYLES).toContain(look.card);
      expect(PHOTO_SHAPES).toContain(look.photo);
      expect(THEME_MOTIFS).toContain(look.motif);
      expect(CORNER_ARTS).toContain(look.corners);
    }
    expect(themeLook(getTheme("film")).grain).toBe(true);
    expect(themeLook(getTheme("coquette")).photo).toBe("arch");
    expect(themeLook(getTheme("boho")).corners).toBe("sprig");
    // Sunda: the siger crown, jasmine strings, and gold ornaments on an emerald accent.
    expect(themeLook(getTheme("sunda"))).toMatchObject({ motif: "siger", corners: "melati", photo: "arch", motifColor: "#a17c33" });
    expect(themeStyle(getTheme("sunda"))["--inv-motif"]).toBe("#a17c33");
    expect(themeStyle(getTheme("minimal"))["--inv-motif"]).toBe(getTheme("minimal").tokens.accent);
    expect(themeLook(getTheme("dusty-blue")).motif).toBe("sprig");
  });

  it("only uses fonts that are actually loaded", () => {
    // Root layout (Fraunces, Plus Jakarta Sans) + components/invitation/invitation-fonts.ts.
    const loaded = new Set(["Fraunces", "Plus Jakarta Sans", "Instrument Serif", "Cormorant Garamond", "Bricolage Grotesque", "DM Serif Display", "Space Mono"]);
    const family = (stack: string) => stack.split(",")[0]!.trim().replace(/^"|"$/g, "");
    for (const theme of INVITATION_THEMES) {
      const look = themeLook(theme);
      for (const stack of [theme.tokens.displayFont, theme.tokens.bodyFont, look.labelFont]) {
        expect(loaded, `${theme.code}: ${stack}`).toContain(family(stack));
      }
    }
  });

  it("keeps text readable (WCAG contrast)", () => {
    const luminance = (hex: string) => {
      const channel = (index: number) => {
        const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
    };
    const contrast = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (light + 0.05) / (dark + 0.05);
    };
    for (const theme of INVITATION_THEMES) {
      const { ink, muted, surface, background } = theme.tokens;
      expect(contrast(ink, background), `${theme.code} ink/background`).toBeGreaterThanOrEqual(7);
      expect(contrast(ink, surface), `${theme.code} ink/surface`).toBeGreaterThanOrEqual(7);
      expect(contrast(muted, surface), `${theme.code} muted/surface`).toBeGreaterThanOrEqual(4.5);
    }
    // Buttons (RSVP, wishes, music, the opening cover) put surface-colored text on the accent.
    for (const { code, tokens } of INVITATION_THEMES) {
      expect(contrast(tokens.accent, tokens.surface), `${code} accent/surface`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("section content", () => {
  it("keeps the editable fields in step with the schemas", () => {
    for (const [type, fields] of Object.entries(SECTION_FIELDS)) {
      expect(fields.map((field) => field.name).sort()).toEqual(
        sectionContentFields(type as keyof typeof SECTION_FIELDS).sort(),
      );
    }
  });

  it("parses stored JSON and tolerates junk", () => {
    expect(parseSectionContent("QUOTE", { text: " Ayat ", source: "", extra: "ignored" })).toEqual({
      text: "Ayat",
      source: null,
    });
    expect(parseSectionContent("QUOTE", null)).toEqual({ text: null, source: null });
    // Content written by a previous save contains explicit nulls; it must survive a round trip.
    expect(parseSectionContent("QUOTE", { text: "Ayat", source: null })).toEqual({ text: "Ayat", source: null });
    expect(parseSectionContent("QUOTE", "corrupt")).toEqual({ text: null, source: null });
    expect(parseSectionContent("COUNTDOWN", { anything: 1 })).toEqual({});
  });

  it("rejects content that is too long", () => {
    expect(parseSectionContent("QUOTE", { text: "x".repeat(601) })).toEqual({ text: null, source: null });
  });
});

describe("invitation settings validation", () => {
  it("normalizes the slug before checking it", () => {
    const parsed = invitationSettingsSchema.safeParse({ slug: " Putri & Fajar ", defaultGuestLabel: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.slug).toBe("putri-fajar");
    expect(parsed.data?.defaultGuestLabel).toBeNull();
  });

  it("rejects a reserved slug", () => {
    expect(invitationSettingsSchema.safeParse({ slug: "admin" }).success).toBe(false);
  });

  it("accepts only known themes and layouts", () => {
    expect(invitationThemeSchema.safeParse({ themeCode: "floral", coverLayout: "center" }).success).toBe(true);
    expect(invitationThemeSchema.safeParse({ themeCode: "hacked", coverLayout: "center" }).success).toBe(false);
    expect(invitationThemeSchema.safeParse({ themeCode: "floral", coverLayout: "diagonal" }).success).toBe(false);
  });
});

describe("wedding event validation", () => {
  const base = {
    name: "Akad Nikah",
    eventDate: "2026-10-21",
    startTime: "09:00",
    endTime: "11:00",
    venueName: "Masjid Agung",
    address: "Jl. Merdeka 1",
    latitude: "-6.914744",
    longitude: "107.609810",
    mapsUrl: "maps.google.com/?q=x",
    dressCode: "Batik",
    notes: "",
  };

  it("parses a complete event", () => {
    const parsed = weddingEventSchema.parse(base);
    expect(parsed).toMatchObject({ name: "Akad Nikah", startTime: "09:00", latitude: -6.914744, longitude: 107.60981 });
    expect(parsed.mapsUrl).toBe("https://maps.google.com/?q=x");
    expect(parsed.notes).toBeNull();
  });

  it("rejects malformed times and a backwards range", () => {
    expect(weddingEventSchema.safeParse({ ...base, startTime: "9am" }).success).toBe(false);
    expect(weddingEventSchema.safeParse({ ...base, startTime: "25:00" }).success).toBe(false);
    const reversed = weddingEventSchema.safeParse({ ...base, startTime: "11:00", endTime: "09:00" });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.path).toEqual(["endTime"]);
  });

  it("requires both coordinates together and keeps them in range", () => {
    expect(weddingEventSchema.safeParse({ ...base, longitude: "" }).success).toBe(false);
    expect(weddingEventSchema.safeParse({ ...base, latitude: "-91" }).success).toBe(false);
    expect(weddingEventSchema.safeParse({ ...base, longitude: "181" }).success).toBe(false);
    expect(weddingEventSchema.safeParse({ ...base, latitude: "", longitude: "" }).success).toBe(true);
  });

  it("rejects an unsafe maps link", () => {
    expect(weddingEventSchema.safeParse({ ...base, mapsUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("gift and love story validation", () => {
  it("accepts a normal account and rejects letters in the number", () => {
    expect(
      giftAccountSchema.safeParse({
        type: "BANK",
        providerName: "BCA",
        accountNumber: "123-456-7890",
        accountHolder: "Putri",
        notes: "",
      }).success,
    ).toBe(true);
    expect(
      giftAccountSchema.safeParse({ type: "BANK", providerName: "BCA", accountNumber: "abc", accountHolder: "Putri" }).success,
    ).toBe(false);
    expect(
      giftAccountSchema.safeParse({ type: "CRYPTO", providerName: "BCA", accountNumber: "123", accountHolder: "Putri" }).success,
    ).toBe(false);
  });

  it("requires a title and a story", () => {
    expect(loveStoryEntrySchema.safeParse({ title: "", story: "x" }).success).toBe(false);
    expect(loveStoryEntrySchema.safeParse({ title: "Pertemuan", story: "" }).success).toBe(false);
    expect(loveStoryEntrySchema.parse({ title: "Pertemuan", timeLabel: "", story: "Kami bertemu" }).timeLabel).toBeNull();
  });
});

describe("maps", () => {
  const target = { latitude: null, longitude: null, mapsUrl: null, address: null, venueName: null };

  it("prefers the couple's own link", () => {
    expect(mapsLink({ ...target, mapsUrl: "https://maps.app.goo.gl/abc", latitude: -6.9, longitude: 107.6 })).toBe(
      "https://maps.app.goo.gl/abc",
    );
  });

  it("falls back to coordinates, then to an address search", () => {
    expect(mapsLink({ ...target, latitude: -6.9, longitude: 107.6 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=-6.9,107.6",
    );
    expect(mapsLink({ ...target, venueName: "Gedung A", address: "Jl. Merdeka" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Gedung%20A%2C%20Jl.%20Merdeka",
    );
    expect(mapsLink(target)).toBeNull();
  });

  it("ignores an unsafe stored link", () => {
    expect(mapsLink({ ...target, mapsUrl: "javascript:alert(1)" })).toBeNull();
  });

  it("builds an embed URL around the marker", () => {
    expect(mapEmbedUrl(-6.9, 107.6)).toContain("marker=-6.9,107.6");
  });
});

describe("image validation", () => {
  it("reads dimensions from PNG, JPEG and WebP headers", () => {
    expect(readImageInfo(pngFixture(300, 200))).toEqual({ mimeType: "image/png", width: 300, height: 200 });
    expect(readImageInfo(jpegHeaderFixture(800, 600))).toEqual({ mimeType: "image/jpeg", width: 800, height: 600 });
    expect(readImageInfo(webpHeaderFixture(640, 480))).toEqual({ mimeType: "image/webp", width: 640, height: 480 });
  });

  it("returns null for anything else", () => {
    expect(readImageInfo(Buffer.from("not an image at all"))).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
  });

  it("rejects by size, type mismatch and dimensions", () => {
    expect(imageRejection(pngFixture(400, 400), "image/png")).toBeNull();
    expect(imageRejection(pngFixture(400, 400), "image/jpeg")).toBe("unsupported_type");
    expect(imageRejection(pngFixture(400, 400), "application/pdf")).toBe("unsupported_type");
    expect(imageRejection(Buffer.from("plain text"), "image/png")).toBe("unsupported_type");
    expect(imageRejection(pngFixture(100, 100), "image/png")).toBe("too_small");
    expect(imageRejection(Buffer.alloc(4 * 1024 * 1024), "image/png")).toBe("too_large");
  });
});

describe("zonedTimeToUtcMs", () => {
  it("maps a local wall clock to the right instant", () => {
    expect(new Date(zonedTimeToUtcMs("2026-10-21", "Asia/Jakarta", "09:00")).toISOString()).toBe("2026-10-21T02:00:00.000Z");
    expect(new Date(zonedTimeToUtcMs("2026-10-21", "Asia/Jakarta")).toISOString()).toBe("2026-10-20T17:00:00.000Z");
    expect(new Date(zonedTimeToUtcMs("2026-10-21", "UTC", "09:00")).toISOString()).toBe("2026-10-21T09:00:00.000Z");
  });

  it("handles a zone with daylight saving", () => {
    // 1 July is CEST (UTC+2), 1 January is CET (UTC+1).
    expect(new Date(zonedTimeToUtcMs("2026-07-01", "Europe/Berlin", "12:00")).toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(new Date(zonedTimeToUtcMs("2026-01-01", "Europe/Berlin", "12:00")).toISOString()).toBe("2026-01-01T11:00:00.000Z");
  });
});
