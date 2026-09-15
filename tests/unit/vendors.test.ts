import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/activity";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { bookVendorSchema, vendorCreateSchema, vendorResearchSchema } from "@/lib/validation/vendor";
import { DEFAULT_RESEARCH_FILTERS, parseCompareIds, parseResearchFilters, researchHref } from "@/lib/vendor-filters";
import {
  instagramUrl,
  normalizeInstagram,
  normalizeWebsite,
  ratingLabel,
  safeExternalUrl,
  whatsappLink,
} from "@/lib/vendors";

function errorsOf(result: { success: boolean; error?: Parameters<typeof fieldErrorsFromZod>[0] }) {
  if (result.success || !result.error) throw new Error("expected validation failure");
  return fieldErrorsFromZod(result.error);
}

describe("contact link helpers", () => {
  it("builds wa.me links from Indonesian numbers", () => {
    expect(whatsappLink("0812-3456-7890")).toBe("https://wa.me/6281234567890");
    expect(whatsappLink("+62 812 3456 7890")).toBe("https://wa.me/6281234567890");
    expect(whatsappLink("81234567890")).toBe("https://wa.me/6281234567890");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });

  it("only allows http(s) links (no javascript:/data:)", () => {
    expect(safeExternalUrl("https://abc.id/paket")).toBe("https://abc.id/paket");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });

  it("normalizes websites and instagram handles", () => {
    expect(normalizeWebsite("abccatering.id")).toBe("https://abccatering.id/");
    expect(normalizeWebsite("http://abc.id/x")).toBe("http://abc.id/x");
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("localhost")).toBeNull();
    expect(normalizeInstagram("@abc.catering")).toBe("abc.catering");
    expect(normalizeInstagram("https://www.instagram.com/abc.catering/")).toBe("abc.catering");
    expect(instagramUrl("abc.catering")).toBe("https://instagram.com/abc.catering");
    expect(instagramUrl("bad handle!")).toBeNull();
  });

  it("labels ratings", () => {
    expect(ratingLabel(4)).toBe("★★★★☆ (4/5)");
    expect(ratingLabel(null)).toBe("Belum dinilai");
  });
});

describe("vendorResearchSchema", () => {
  const valid = {
    name: "ABC Catering",
    categoryId: randomUUID(),
    status: "SHORTLISTED",
    estimatedPrice: "30.000.000",
    rating: "4",
    whatsapp: "0812-3456-7890",
    instagram: "@abccatering",
    website: "abccatering.id",
  };

  it("parses and normalizes a candidate", () => {
    expect(vendorResearchSchema.parse(valid)).toMatchObject({
      estimatedPrice: 30_000_000n,
      rating: 4,
      instagram: "abccatering",
      website: "https://abccatering.id/",
      phone: null,
      pros: null,
    });
  });

  it("rejects unsafe or malformed contact data and invalid ratings", () => {
    const errors = errorsOf(
      vendorResearchSchema.safeParse({
        ...valid,
        website: "javascript:alert(1)",
        instagram: "not valid!",
        whatsapp: "call me",
        rating: "6",
      }),
    );
    expect(errors.website?.[0]).toContain("website tidak valid");
    expect(errors.instagram).toEqual(["Username Instagram tidak valid"]);
    expect(errors.whatsapp?.[0]).toContain("tidak valid");
    expect(errors.rating).toEqual(["Rating harus 1 sampai 5"]);
  });

  it("does not allow setting SELECTED manually (only via booking)", () => {
    expect(errorsOf(vendorResearchSchema.safeParse({ ...valid, status: "SELECTED" })).status).toEqual(["Pilih status"]);
  });
});

describe("booking schemas", () => {
  it("requires a budget category when a contract value is given", () => {
    expect(errorsOf(bookVendorSchema.safeParse({ contractValue: "30.000.000" })).budgetCategoryId).toEqual([
      "Pilih kategori budget untuk mencatat kontrak",
    ]);
    expect(bookVendorSchema.parse({ contractValue: "", budgetCategoryId: "" })).toMatchObject({
      contractValue: null,
      budgetCategoryId: null,
    });
    const categoryId = randomUUID();
    expect(bookVendorSchema.parse({ contractValue: "30.000.000", budgetCategoryId: categoryId })).toMatchObject({
      contractValue: 30_000_000n,
      budgetCategoryId: categoryId,
    });
  });

  it("applies the same rule when creating a vendor directly", () => {
    const errors = errorsOf(vendorCreateSchema.safeParse({ name: "Foto Kita", categoryId: randomUUID(), contractValue: "5.000.000" }));
    expect(errors.budgetCategoryId).toBeDefined();
  });
});

describe("research filters & compare ids", () => {
  it("parses filters with safe defaults", () => {
    expect(parseResearchFilters({ view: "hacker", page: "-1" })).toEqual(DEFAULT_RESEARCH_FILTERS);
    expect(parseResearchFilters({ view: "REJECTED" }).view).toBe("REJECTED");
    expect(researchHref(DEFAULT_RESEARCH_FILTERS, { view: "all" })).toBe("/vendors/research?view=all");
  });

  it("dedupes, validates and caps compare ids", () => {
    const [a, b, c, d, e] = Array.from({ length: 5 }, () => randomUUID());
    expect(parseCompareIds([a!, a!, "nope", `${b},${c}`], 4)).toEqual([a, b, c]);
    expect(parseCompareIds([a!, b!, c!, d!, e!], 4)).toHaveLength(4);
    expect(parseCompareIds(undefined, 4)).toEqual([]);
  });
});

describe("vendor activity descriptions", () => {
  it("describes booking with the contract value", () => {
    const text = describeActivity({ action: "vendor.booked", actorName: "Fajar", metadata: { name: "ABC Catering", amount: "30000000" } });
    expect(text.replace(/ /g, " ")).toBe("Fajar memilih “ABC Catering” sebagai vendor dengan kontrak Rp 30.000.000");
    expect(
      describeActivity({ action: "vendor_research.updated", actorName: "Putri", metadata: { name: "XYZ", status: "REJECTED" } }),
    ).toBe("Putri memperbarui kandidat vendor “XYZ” (Tidak dipilih)");
  });
});
