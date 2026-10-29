import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ChubDatabase } from "../db/client.js";

type AppEnv = { Bindings: { db: ChubDatabase } };
type ImageFormat = { extension: "png" | "jpg" | "gif" | "webp"; mime: string };
type Dimensions = { width: number; height: number } | null;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Bound multipart framing so an exact-limit file fits but declared oversized bodies can be rejected before parsing.
const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_MULTIPART_SIZE = MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD;
const IMAGE_FORMATS: Record<string, ImageFormat> = {
  png: { extension: "png", mime: "image/png" },
  jpeg: { extension: "jpg", mime: "image/jpeg" },
  gif: { extension: "gif", mime: "image/gif" },
  webp: { extension: "webp", mime: "image/webp" },
};

function sniffImage(bytes: Buffer): ImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes.subarray(1, 4).toString("ascii") === "PNG" &&
    bytes.subarray(4, 8).equals(Buffer.from([0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return IMAGE_FORMATS.png!;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return IMAGE_FORMATS.jpeg!;
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return IMAGE_FORMATS.gif!;
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return IMAGE_FORMATS.webp!;
  }
  return null;
}

function pngCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes: Buffer): Dimensions {
  if (
    bytes.length < 8 ||
    bytes.subarray(0, 8).compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) !== 0
  ) {
    return null;
  }

  let offset = 8;
  let dimensions: Dimensions = null;
  let sawImageData = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(offset);
    if (chunkLength > bytes.length - offset - 12) return null;
    const chunkType = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const crcOffset = dataStart + chunkLength;
    const expectedCrc = bytes.readUInt32BE(crcOffset);
    if (chunkType === "IHDR" && pngCrc32(bytes.subarray(offset + 4, crcOffset)) !== expectedCrc) return null;

    if (offset === 8) {
      if (chunkType !== "IHDR" || chunkLength !== 13) return null;
      const width = bytes.readUInt32BE(dataStart);
      const height = bytes.readUInt32BE(dataStart + 4);
      if (width === 0 || height === 0) return null;
      dimensions = { width, height };
    } else if (chunkType === "IHDR") {
      return null;
    }

    if (chunkType === "IDAT") sawImageData = true;
    offset = crcOffset + 4;
    if (chunkType === "IEND") {
      if (chunkLength !== 0 || !sawImageData || offset !== bytes.length) return null;
      sawEnd = true;
      break;
    }
  }

  return sawEnd ? dimensions : null;
}

function skipGifSubBlocks(bytes: Buffer, start: number): number | null {
  let offset = start;
  while (offset < bytes.length) {
    const blockLength = bytes[offset++]!;
    if (blockLength === 0) return offset;
    if (blockLength > bytes.length - offset) return null;
    offset += blockLength;
  }
  return null;
}

function gifDimensions(bytes: Buffer): Dimensions {
  if (
    bytes.length < 13 ||
    (bytes.subarray(0, 6).toString("ascii") !== "GIF87a" && bytes.subarray(0, 6).toString("ascii") !== "GIF89a")
  ) {
    return null;
  }

  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (width === 0 || height === 0) return null;

  const screenFlags = bytes[10]!;
  let offset = 13;
  if (screenFlags & 0x80) {
    offset += 3 * (2 ** ((screenFlags & 0x07) + 1));
    if (offset > bytes.length) return null;
  }

  let sawImage = false;
  while (offset < bytes.length) {
    const blockType = bytes[offset++]!;
    if (blockType === 0x3b) {
      return sawImage && offset === bytes.length ? { width, height } : null;
    }
    if (blockType === 0x21) {
      if (offset >= bytes.length) return null;
      offset += 1; // extension label
      const nextOffset = skipGifSubBlocks(bytes, offset);
      if (nextOffset === null) return null;
      offset = nextOffset;
      continue;
    }
    if (blockType !== 0x2c || offset + 9 > bytes.length) return null;

    const imageFlags = bytes[offset + 8]!;
    offset += 9;
    if (imageFlags & 0x80) {
      offset += 3 * (2 ** ((imageFlags & 0x07) + 1));
      if (offset > bytes.length) return null;
    }
    if (offset >= bytes.length || bytes[offset]! < 2 || bytes[offset]! > 8) return null;
    offset += 1; // LZW minimum code size
    const nextOffset = skipGifSubBlocks(bytes, offset);
    if (nextOffset === null) return null;
    offset = nextOffset;
    sawImage = true;
  }
  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function jpegDimensions(bytes: Buffer): Dimensions {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  let dimensions: Dimensions = null;
  let sawScan = false;
  let inScan = false;
  let marker: number | null = null;
  while (offset < bytes.length) {
    if (inScan) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;
      marker = bytes[offset++]!;
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
        marker = null;
        continue;
      }
      inScan = false;
    } else if (marker === null) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;
      marker = bytes[offset++]!;
    }

    const currentMarker = marker;
    marker = null;
    if (currentMarker === 0xd9) {
      return dimensions && sawScan && offset === bytes.length ? dimensions : null;
    }
    if (currentMarker === 0x01 || (currentMarker >= 0xd0 && currentMarker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || segmentLength > bytes.length - offset) return null;
    if (isJpegStartOfFrame(currentMarker)) {
      if (segmentLength < 8 || dimensions !== null) return null;
      const componentCount = bytes[offset + 7]!;
      if (componentCount === 0 || segmentLength !== 8 + 3 * componentCount) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return null;
      dimensions = { width, height };
    }

    if (currentMarker === 0xda) {
      if (dimensions === null) return null;
      sawScan = true;
      inScan = true;
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Buffer): Dimensions {
  if (bytes.length < 12 || bytes.readUInt32LE(4) !== bytes.length - 8) return null;

  const riffEnd = bytes.length;
  let offset = 12;
  let dimensions: Dimensions = null;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) return null;
    const chunk = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    const paddedLength = chunkLength + (chunkLength % 2);
    if (paddedLength > riffEnd - data) return null;

    if (chunk === "VP8X" && chunkLength === 10) {
      const width = 1 + bytes.readUIntLE(data + 4, 3);
      const height = 1 + bytes.readUIntLE(data + 7, 3);
      dimensions = { width, height };
    } else if (chunk === "VP8 " && chunkLength >= 10 && bytes.subarray(data + 3, data + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      const width = bytes.readUInt16LE(data + 6) & 0x3fff;
      const height = bytes.readUInt16LE(data + 8) & 0x3fff;
      dimensions = width > 0 && height > 0 ? { width, height } : null;
    } else if (chunk === "VP8L" && chunkLength >= 5 && bytes[data] === 0x2f) {
      const width = 1 + bytes[data + 1]! + ((bytes[data + 2]! & 0x3f) << 8);
      const height = 1 + (bytes[data + 2]! >> 6) + (bytes[data + 3]! << 2) + ((bytes[data + 4]! & 0x0f) << 10);
      dimensions = { width, height };
    }

    offset = data + paddedLength;
  }
  return offset === riffEnd ? dimensions : null;
}

function imageDimensions(bytes: Buffer, format: ImageFormat): Dimensions {
  switch (format.extension) {
    case "png":
      return pngDimensions(bytes);
    case "jpg":
      return jpegDimensions(bytes);
    case "gif":
      return gifDimensions(bytes);
    case "webp":
      return webpDimensions(bytes);
  }
}

function uploadsDirectory(db: ChubDatabase): string {
  if (db.$client.name === ":memory:") {
    // :memory: has no adjacent file; store at <os.tmpdir()>/chub/uploads, never relative to CWD.
    return resolve(tmpdir(), "chub", "uploads");
  }
  return resolve(dirname(resolve(db.$client.name)), "uploads");
}

function errorResponse(c: Context<AppEnv>, error: string, status: 400 | 413): Response {
  return c.json({ error }, status);
}

function isUploadedFile(value: unknown): value is File {
  return typeof value === "object" && value !== null && "size" in value && "arrayBuffer" in value && typeof value.arrayBuffer === "function";
}

export function createUploadRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post(
    "/api/uploads",
    async (c, next) => {
      const contentLength = c.req.header("content-length");
      if (contentLength !== undefined && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_MULTIPART_SIZE) {
        return c.json({ error: "payload_too_large" }, 413);
      }
      await next();
    },
    bodyLimit({
      maxSize: MAX_MULTIPART_SIZE,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      if (!c.req.header("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
        return errorResponse(c, "unsupported_media_type", 400);
      }

      let fields: Record<string, string | File | (string | File)[]>;
      try {
        fields = await c.req.parseBody();
      } catch {
        return errorResponse(c, "unsupported_media_type", 400);
      }
      const file = fields.file;
      if (!isUploadedFile(file)) return errorResponse(c, "unsupported_media_type", 400);
      if (file.size > MAX_FILE_SIZE) return errorResponse(c, "payload_too_large", 413);

      const bytes = Buffer.from(await file.arrayBuffer());
      const format = sniffImage(bytes);
      if (!format) return errorResponse(c, "unsupported_media_type", 400);

      const name = `${randomBytes(16).toString("hex")}.${format.extension}`;
      const directory = uploadsDirectory(c.env.db);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, name), bytes, { flag: "wx" });

      const dimensions = imageDimensions(bytes, format);
      return c.json({
        url: `/uploads/${name}`,
        mime: format.mime,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      }, 201);
    },
  );

  routes.get("/uploads/:name", async (c) => {
    const name = c.req.param("name");
    const match = /^([a-f0-9]{32})\.(png|jpg|gif|webp)$/.exec(name);
    if (!match) return c.notFound();

    const directory = uploadsDirectory(c.env.db);
    const path = resolve(directory, name);
    if (dirname(path) !== directory) return c.notFound();

    try {
      const bytes = await readFile(path);
      const extension = match[2]!;
      const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
      return c.body(bytes, 200, { "Content-Type": mime, "X-Content-Type-Options": "nosniff" });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        return c.notFound();
      }
      throw error;
    }
  });

  return routes;
}
