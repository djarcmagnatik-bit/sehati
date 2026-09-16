import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, checksum]);
}

/** A real, decodable PNG of a single color — used wherever a test needs actual image bytes. */
export function pngFixture(width = 400, height = 400, color: [number, number, number] = [200, 120, 90]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: truecolor
  const row = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.concat(Array.from({ length: width }, () => Buffer.from(color))),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Minimal JPEG header (SOI + SOF0) — enough for dimension parsing, not a decodable image. */
export function jpegHeaderFixture(width = 800, height = 600): Buffer {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffd8, 0); // SOI
  sof.writeUInt16BE(0xffe0, 2); // APP0
  sof.writeUInt16BE(0x0002, 4); // APP0 length (the length bytes only)
  sof.writeUInt16BE(0xffc0, 6); // SOF0
  sof.writeUInt16BE(0x000b, 8); // length
  sof[10] = 8; // precision
  sof.writeUInt16BE(height, 11);
  sof.writeUInt16BE(width, 13);
  return sof;
}

/** Minimal lossy WebP header (RIFF/WEBP/VP8 with the frame's 14-bit dimensions). */
export function webpHeaderFixture(width = 640, height = 480): Buffer {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8 ", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes[20] = 0x00;
  bytes[23] = 0x9d;
  bytes[24] = 0x01;
  bytes[25] = 0x2a;
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
}
