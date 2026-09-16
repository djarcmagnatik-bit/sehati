/**
 * Image validation without a native image library: the format and dimensions are read from the
 * file's own header, so a renamed or malformed file is rejected before it is ever stored.
 */

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 8000;
export const IMAGE_MIN_DIMENSION = 200;
export const GALLERY_MAX_IMAGES = 30;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type ImageInfo = { mimeType: ImageMimeType; width: number; height: number };

function readPng(bytes: Uint8Array): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Bytes 12..15 are the chunk type; the first chunk must be IHDR.
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== "IHDR") return null;
  return { mimeType: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpeg(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers in that range.
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { mimeType: "image/jpeg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(bytes: Uint8Array): ImageInfo | null {
  const tag = (start: number) => String.fromCharCode(...Array.from(bytes.slice(start, start + 4)));
  if (bytes.length < 30 || tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = tag(12);
  if (format === "VP8X") {
    const width = 1 + ((bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) & 0xffffff);
    const height = 1 + ((bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) & 0xffffff);
    return { mimeType: "image/webp", width, height };
  }
  if (format === "VP8 ") {
    // Lossy: 3-byte frame tag, a 3-byte start code, then 14-bit width/height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      mimeType: "image/webp",
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return { mimeType: "image/webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/** Format and pixel size from the file header, or null when the bytes are not a supported image. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
}

export type ImageRejection = "too_large" | "unsupported_type" | "too_small" | "too_wide";

export function imageRejection(bytes: Uint8Array, declaredType: string): ImageRejection | null {
  if (bytes.byteLength > IMAGE_MAX_BYTES) return "too_large";
  const type = declaredType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type && !(IMAGE_MIME_TYPES as readonly string[]).includes(type)) return "unsupported_type";
  const info = readImageInfo(bytes);
  if (!info) return "unsupported_type";
  // The header wins over the declared type, so a renamed file cannot slip through.
  if (type && type !== info.mimeType) return "unsupported_type";
  if (info.width < IMAGE_MIN_DIMENSION || info.height < IMAGE_MIN_DIMENSION) return "too_small";
  if (info.width > IMAGE_MAX_DIMENSION || info.height > IMAGE_MAX_DIMENSION) return "too_wide";
  return null;
}

export const IMAGE_REJECTION_MESSAGE: Record<ImageRejection, string> = {
  too_large: `Ukuran gambar maksimal ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
  unsupported_type: "Format gambar harus JPG, PNG, atau WebP.",
  too_small: `Gambar terlalu kecil. Minimal ${IMAGE_MIN_DIMENSION}px pada sisi terpendek.`,
  too_wide: `Gambar terlalu besar. Maksimal ${IMAGE_MAX_DIMENSION}px per sisi.`,
};

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function mediaPath(assetId: string): string {
  return `/media/${assetId}`;
}

// ─── Audio (invitation background music) ─────────────────────────────────────

export const AUDIO_MAX_BYTES = 6 * 1024 * 1024;
export const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp4", "audio/ogg"] as const;
export type AudioMimeType = (typeof AUDIO_MIME_TYPES)[number];

/** Browsers and OSes report the same formats under several names. */
const AUDIO_TYPE_ALIASES: Record<string, AudioMimeType> = {
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg-3": "audio/mpeg",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/aac": "audio/mp4",
  "audio/ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
};

/** Format from the file's own header: ID3 tag or MPEG frame sync, an MP4 "ftyp" box, or "OggS". */
export function readAudioType(bytes: Uint8Array): AudioMimeType | null {
  if (bytes.length < 12) return null;
  const ascii = (start: number, length: number) => String.fromCharCode(...Array.from(bytes.slice(start, start + length)));
  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  // MPEG audio frame: 11 set sync bits, and a layer that is not "reserved".
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x06) !== 0) return "audio/mpeg";
  if (ascii(4, 4) === "ftyp") return "audio/mp4";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  return null;
}

export type AudioRejection = "too_large" | "unsupported_type";

export function audioRejection(bytes: Uint8Array, declaredType: string): AudioRejection | null {
  if (bytes.byteLength > AUDIO_MAX_BYTES) return "too_large";
  const raw = declaredType.split(";")[0]?.trim().toLowerCase() ?? "";
  const declared = raw ? AUDIO_TYPE_ALIASES[raw] : undefined;
  if (raw && !declared && raw !== "application/octet-stream") return "unsupported_type";
  const actual = readAudioType(bytes);
  if (!actual) return "unsupported_type";
  if (declared && declared !== actual) return "unsupported_type";
  return null;
}

export const AUDIO_REJECTION_MESSAGE: Record<AudioRejection, string> = {
  too_large: `Ukuran file musik maksimal ${Math.round(AUDIO_MAX_BYTES / (1024 * 1024))} MB.`,
  unsupported_type: "Format musik harus MP3, M4A, atau OGG.",
};
