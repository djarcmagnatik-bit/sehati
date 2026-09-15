import { describe, expect, it } from "vitest";
import { formatRupiah, MAX_RUPIAH, parseRupiah } from "@/lib/money";

const normalizeSpaces = (value: string) => value.replace(/ /g, " ");

describe("parseRupiah", () => {
  it.each<[string, bigint]>([
    ["100000000", 100_000_000n],
    ["100.000.000", 100_000_000n],
    ["Rp 100.000.000", 100_000_000n],
    ["rp100.000.000", 100_000_000n],
    ["Rp. 2.500.000", 2_500_000n],
    ["100.000.000,00", 100_000_000n],
    ["  30.000.000 ", 30_000_000n],
    ["0", 0n],
  ])("parses %j", (input, expected) => {
    expect(parseRupiah(input)).toBe(expected);
  });

  it.each(["", "Rp", "abc", "-100", "100,50", "1.00.000", "10.5", "1e6", "100 000", "12.345.67"])(
    "rejects %j",
    (input) => {
      expect(parseRupiah(input)).toBeNull();
    },
  );

  it("keeps full precision for large amounts (no floating point)", () => {
    expect(parseRupiah("999.999.999.999.999")).toBe(999_999_999_999_999n);
  });

  it("enforces the maximum amount", () => {
    expect(parseRupiah(MAX_RUPIAH.toString())).toBe(MAX_RUPIAH);
    expect(parseRupiah((MAX_RUPIAH + 1n).toString())).toBeNull();
  });
});

describe("formatRupiah", () => {
  it("formats whole rupiah using Indonesian separators", () => {
    expect(normalizeSpaces(formatRupiah(100_000_000n))).toBe("Rp 100.000.000");
    expect(normalizeSpaces(formatRupiah(0n))).toBe("Rp 0");
  });

  it("round-trips with parseRupiah", () => {
    const amount = 123_456_789n;
    expect(parseRupiah(normalizeSpaces(formatRupiah(amount)))).toBe(amount);
  });
});
