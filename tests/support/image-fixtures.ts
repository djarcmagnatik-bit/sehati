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

/** JPEG: SOI, APP0, APP1 EXIF (orientation + a GPS-like marker), COM, SOF0, SOS + data, EOI. */
export function jpegWithExifFixture(orientation = 6): Buffer {
  const segment = (marker: number, payload: Buffer) => {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(marker, 0);
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([header, payload]);
  };
  const tiff = Buffer.alloc(8 + 2 + 24 + 4 + 32);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt16LE(0x8825, 22); // GPS IFD pointer
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(38, 30);
  tiff.write("GPS-6.914744,107.609810", 38, "ascii");
  const sof = Buffer.from([0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  const sos = Buffer.from([0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xffe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
    segment(0xffe1, Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff])),
    segment(0xfffe, Buffer.from("Taken at Jl. Rahasia 12", "ascii")),
    segment(0xffc0, sof),
    segment(0xffda, sos),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}
