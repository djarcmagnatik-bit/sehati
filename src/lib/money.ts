/**
 * Money helpers. Amounts are whole rupiah as `bigint` — never floating point.
 */

/** Upper bound accepted from user input (just under Rp1 kuadriliun). Fits PostgreSQL BIGINT. */
export const MAX_RUPIAH = 999_999_999_999_999n;

const GROUPED = /^\d{1,3}(\.\d{3})+$/;
const PLAIN = /^\d+$/;

/**
 * Parses Indonesian rupiah input such as "100.000.000", "Rp 100.000.000", "100000000" or
 * "100.000.000,00". Returns null for anything ambiguous, negative, fractional or out of range.
 */
export function parseRupiah(input: string): bigint | null {
  let value = input.trim().replace(/^rp\.?\s*/i, "");
  // Allow a trailing zero-only decimal part (",0" / ",00"); real fractions are rejected.
  value = value.replace(/,0{1,2}$/, "");
  if (value === "") return null;
  if (!GROUPED.test(value) && !PLAIN.test(value)) return null;

  const amount = BigInt(value.replaceAll(".", ""));
  if (amount > MAX_RUPIAH) return null;
  return amount;
}

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats whole rupiah, e.g. 100000000n → "Rp 100.000.000" (with a non-breaking space). */
export function formatRupiah(amount: bigint): string {
  return rupiahFormatter.format(amount);
}

/** Formats digits with Indonesian thousand separators without the currency symbol. */
export function formatRupiahDigits(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount);
}
