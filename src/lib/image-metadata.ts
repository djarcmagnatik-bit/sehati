/**
 * Removes metadata from uploaded images before they are stored (pure).
 *
 * Phone photos carry EXIF: GPS position, device, capture time. Gallery and cover images are served
 * publicly with the invitation, so that metadata is dropped. Only what affects how pixels are shown
 * is kept: colour profiles, transparency, gamma, and the JPEG orientation (rewritten as a minimal
 * EXIF block so portrait photos are not displayed sideways).
 */

export type StrippableImageType = "image/jpeg" | "image/png" | "image/webp";

// ─── JPEG ────────────────────────────────────────────────────────────────────

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...Array.from(bytes.subarray(start, start + length)));

/** Orientation (1–8) from an APP1 EXIF payload, or null. */
function readExifOrientation(segment: Uint8Array): number | null {
  // segment = "Exif\0\0" + TIFF
  if (segment.length < 14 || ascii(segment, 0, 6) !== "Exif\0\0") return null;
  const tiff = segment.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  if (view.getUint16(2, little) !== 42) return null;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return null;
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > tiff.length) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** APP1 segment holding only the Orientation tag. */
function orientationSegment(orientation: number): Uint8Array {
  const payload = [
    ...Array.from("Exif\0\0", (char) => char.charCodeAt(0)),
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const length = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | null = null;
  let position = 2;

  while (position < bytes.length) {
    if (bytes[position] !== 0xff) return null;
    let marker = bytes[position + 1];
    // Fill bytes between markers.
    while (marker === 0xff && position + 2 < bytes.length) {
      position += 1;
      marker = bytes[position + 1];
    }
    if (marker === undefined) return null;
    // Start of scan: everything after is entropy-coded image data (plus EOI); keep it verbatim.
    if (marker === 0xda) {
      kept.push(bytes.subarray(position));
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(position, position + 2));
      position += 2;
      continue;
    }
    if (position + 4 > bytes.length) return null;
    const length = (bytes[position + 2]! << 8) | bytes[position + 3]!;
    const end = position + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    const segment = bytes.subarray(position, end);
    const payload = bytes.subarray(position + 4, end);

    const isApp = marker >= 0xe0 && marker <= 0xef;
    let keep = true;
    if (marker === 0xfe) keep = false; // comment
    else if (isApp) {
      if (marker === 0xe1) orientation ??= readExifOrientation(payload);
      // APP0 (JFIF), APP2 ICC profile and APP14 (Adobe colour transform) change how pixels decode.
      keep = marker === 0xe0 || marker === 0xee || (marker === 0xe2 && ascii(payload, 0, 12) === "ICC_PROFILE\0");
    }
    if (keep) kept.push(segment);
    position = end;
  }

  if (orientation !== null && orientation !== 1) kept.splice(1, 0, orientationSegment(orientation));
  return concat(kept);
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

/** Chunks that affect decoding or display. Text, EXIF and timestamps are dropped. */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD", "acTL", "fcTL", "fdAT"]);

function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let position = 8;
  while (position < bytes.length) {
    if (position + 12 > bytes.length) return null;
    const length = view.getUint32(position);
    const type = ascii(bytes, position + 4, 4);
    const end = position + 12 + length;
    if (end > bytes.length) return null;
    if (PNG_KEEP.has(type)) kept.push(bytes.subarray(position, end));
    position = end;
    if (type === "IEND") break;
  }
  return concat(kept);
}

// ─── WebP ────────────────────────────────────────────────────────────────────

const WEBP_FLAG_EXIF = 0x08;
const WEBP_FLAG_XMP = 0x04;

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let position = 12;
  while (position + 8 <= bytes.length) {
    const type = ascii(bytes, position, 4);
    const size = view.getUint32(position + 4, true);
    const end = position + 8 + size + (size % 2);
    if (end > bytes.length) return null;
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = bytes.slice(position, end);
      if (type === "VP8X" && chunk.length > 8) chunk[8] = chunk[8]! & ~(WEBP_FLAG_EXIF | WEBP_FLAG_XMP);
      chunks.push(chunk);
    }
    position = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** The same image without metadata, or null when the file structure is not what its type claims. */
export function stripImageMetadata(bytes: Uint8Array, type: StrippableImageType): Uint8Array | null {
  switch (type) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
  }
}

// ─── File names ──────────────────────────────────────────────────────────────

const EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg", "jfif"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a", "mp4", "aac"],
  "audio/ogg": ["ogg", "oga", "opus"],
};

/**
 * The original name is never used for storage, but an extension that contradicts the content
 * (e.g. "photo.php" or "song.exe") is refused. Names without an extension are accepted.
 */
export function extensionMatchesType(fileName: string, type: string): boolean {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return true;
  const extension = base.slice(dot + 1).toLowerCase();
  return (EXTENSIONS[type] ?? []).includes(extension);
}
