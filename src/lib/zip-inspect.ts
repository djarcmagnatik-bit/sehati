/** Cheap ZIP sanity checks before a spreadsheet is decompressed (pure). */

export const ZIP_MAX_ENTRIES = 200;
/** An import sheet unpacks to far less; anything bigger is a decompression bomb, not a guest list. */
export const ZIP_MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;

export type ZipProblem = "not_zip" | "too_many_entries" | "too_large" | "zip64";

/**
 * Reads the central directory (at the end of the file) and adds up the declared uncompressed sizes
 * without inflating anything. ZIP64 archives are refused: a guest list never needs them.
 */
export function inspectZip(bytes: Uint8Array): ZipProblem | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: 22 bytes + comment of up to 65535 bytes.
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let position = bytes.length - 22; position >= earliest; position -= 1) {
    if (view.getUint32(position, true) === 0x06054b50) {
      eocd = position;
      break;
    }
  }
  if (eocd < 0) return "not_zip";

  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) return "zip64";
  if (entries > ZIP_MAX_ENTRIES) return "too_many_entries";
  if (directoryOffset + directorySize > eocd) return "not_zip";

  let total = 0;
  let position = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) return "not_zip";
    const uncompressed = view.getUint32(position + 24, true);
    if (uncompressed === 0xffffffff) return "zip64";
    total += uncompressed;
    if (total > ZIP_MAX_UNCOMPRESSED_BYTES) return "too_large";
    position += 46 + view.getUint16(position + 28, true) + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
  }
  return null;
}
