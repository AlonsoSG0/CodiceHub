import { existsSync, mkdtempSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=",
  "base64",
);
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
  "base64",
);
const gif = Buffer.concat([
  Buffer.from("GIF89a", "ascii"),
  Buffer.from([
    1, 0, 1, 0, 0x80, 0, 0, // 1x1 logical screen with a two-entry global colour table
    0, 0, 0, 255, 255, 255,
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, // image descriptor
    2, 2, 0x44, 0x01, 0, // minimal LZW image data
    0x3b, // GIF trailer
  ]),
]);
const boundary = "----chub-upload-test-boundary";

function multipartBody(filename: string, bytes: Buffer, contentType: string): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      "utf8",
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
}

function multipartRequest(filename: string, bytes: Buffer, contentType: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: multipartBody(filename, bytes, contentType),
  };
}

describe("image upload API", () => {
  let db: ChubDatabase;
  let databasePath: string;
  let uploadsDirectory: string;
  let request: (url: string, init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    databasePath = join(mkdtempSync(join(tmpdir(), "chub-uploads-")), "chub.db");
    uploadsDirectory = join(dirname(databasePath), "uploads");
    db = createDb(databasePath);
    request = (url, init) => app.request(url, init, { db });
  });

  afterEach(() => db.$client.close());

  async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.text()).toBe(JSON.stringify(body));
  }

  async function upload(filename: string, bytes: Buffer, contentType = "application/octet-stream"): Promise<Response> {
    return request("/api/uploads", multipartRequest(filename, bytes, contentType));
  }

  it("stores and serves a genuine PNG with exact bytes and parsed dimensions", async () => {
    const response = await upload("pixel.png", png, "image/png");
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const raw = await response.text();
    const result = JSON.parse(raw) as { url: string; mime: string; width: number | null; height: number | null };
    expect(raw).toBe(JSON.stringify(result));
    expect(Object.keys(result).sort()).toEqual(["height", "mime", "url", "width"]);
    expect(result).toEqual({ url: expect.stringMatching(/^\/uploads\/[a-f0-9]{32}\.png$/), mime: "image/png", width: 1, height: 1 });

    const served = await request(result.url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(png);
    expect(readFileSync(join(uploadsDirectory, result.url.slice("/uploads/".length)))).toEqual(png);
  });

  it("sniffs valid JPEG bytes instead of trusting the multipart Content-Type", async () => {
    const response = await upload("photo.png", jpeg, "image/png");
    expect(response.status).toBe(201);
    const raw = await response.text();
    const result = JSON.parse(raw) as { url: string; mime: string; width: number | null; height: number | null };
    expect(raw).toBe(JSON.stringify(result));
    expect(result).toEqual({ url: expect.stringMatching(/^\/uploads\/[a-f0-9]{32}\.jpg$/), mime: "image/jpeg", width: 1, height: 1 });
  });

  it("rejects non-image bytes even when the client claims image/png", async () => {
    await expectJson(await upload("fake.png", Buffer.from("not an image"), "image/png"), 400, {
      error: "unsupported_media_type",
    });
    expect(existsSync(uploadsDirectory) ? readdirSync(uploadsDirectory) : []).toEqual([]);
  });

  it("rejects SVG content explicitly", async () => {
    await expectJson(
      await upload("script.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml"),
      400,
      { error: "unsupported_media_type" },
    );
    expect(existsSync(uploadsDirectory) ? readdirSync(uploadsDirectory) : []).toEqual([]);
  });

  it("accepts a file body exactly 10 MB", async () => {
    const exactLimit = Buffer.alloc(10 * 1024 * 1024, 0);
    exactLimit.write("GIF89a", 0, "ascii");
    const response = await upload("limit.gif", exactLimit, "image/gif");
    expect(response.status).toBe(201);
    const result = await response.json() as { url: string; mime: string; width: number | null; height: number | null };
    expect(result).toEqual({ url: expect.stringMatching(/^\/uploads\/[a-f0-9]{32}\.gif$/), mime: "image/gif", width: null, height: null });
    expect(readFileSync(join(uploadsDirectory, result.url.slice("/uploads/".length)))).toHaveLength(10 * 1024 * 1024);
  });

  it("rejects a declared oversized request before consuming its body", async () => {
    let bodyConsumed = false;
    const declaredOversizedBody = new Uint8Array(10 * 1024 * 1024 + 64 * 1024 + 1);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyConsumed = true;
        controller.enqueue(declaredOversizedBody);
        controller.close();
      },
    }, { highWaterMark: 0 });
    const response = await request("/api/uploads", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(declaredOversizedBody.byteLength),
      },
      body,
      duplex: "half",
    });
    expect(bodyConsumed).toBe(false);
    await expectJson(response, 413, { error: "payload_too_large" });
  });

  it("rejects an oversized body even when its declared length lies", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    const response = await request("/api/uploads", {
      ...multipartRequest("large.png", oversized, "image/png"),
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": "1",
      },
    });
    await expectJson(response, 413, { error: "payload_too_large" });
    expect(existsSync(uploadsDirectory) ? readdirSync(uploadsDirectory) : []).toEqual([]);
  });

  it("rejects file bodies larger than 10 MB with the exact S9 response", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    await expectJson(await upload("large.png", oversized, "image/png"), 413, { error: "payload_too_large" });
    expect(existsSync(uploadsDirectory) ? readdirSync(uploadsDirectory) : []).toEqual([]);
  });

  it.each(["../../evil.png", "/etc/passwd.png", "evil\u0000.png"])(
    "keeps client filename %j out of the stored path",
    async (filename) => {
      const response = await upload(filename, png, "image/png");
      expect(response.status).toBe(201);
      const raw = await response.text();
      const result = JSON.parse(raw) as { url: string; mime: string; width: number | null; height: number | null };
      expect(raw).toBe(JSON.stringify(result));
      expect(result.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.png$/);
      const storedName = result.url.slice("/uploads/".length);
      expect(storedName).not.toMatch(/[\\/]/);
      const storedPath = resolve(uploadsDirectory, storedName);
      expect(storedPath.startsWith(`${resolve(uploadsDirectory)}${sep}`)).toBe(true);
      expect(realpathSync(storedPath).startsWith(`${realpathSync(uploadsDirectory)}${sep}`)).toBe(true);
      expect(readFileSync(storedPath)).toEqual(png);
      expect(readdirSync(uploadsDirectory)).toEqual([storedName]);
    },
  );

  it("returns 404 for unknown names and every path-like upload name", async () => {
    const paths = [
      "/uploads/..%2f..%2fetc%2fpasswd",
      "/uploads/..%5c..%5cetc%5cpasswd",
      "/uploads/%2Fetc%2Fpasswd.png",
      "/uploads/%252e%252e%252f",
      "/uploads/~",
      `/uploads/${"a".repeat(32)}.png.`,
      `/uploads/${"a".repeat(32)}.png%20`,
      `/uploads/${"a".repeat(8192)}.png`,
      "/uploads/subdir/file.png",
      "/uploads/nope.png",
      "/uploads/file%00.png",
    ];
    for (const path of paths) {
      const response = await request(path);
      expect(response.status, path).toBe(404);
    }
  });

  it("does not trust dimensions from the exact GIF/SVG polyglot probe", async () => {
    const polyglot = Buffer.from("GIF89a<svg onload=alert(1)></svg>", "ascii");
    expect(polyglot).toHaveLength(33);

    const response = await upload("polyglot.gif", polyglot, "image/gif");
    expect(response.status).toBe(201);
    const result = await response.json() as { url: string; mime: string; width: number | null; height: number | null };
    expect(result).not.toMatchObject({ width: 29500, height: 26486 });
    expect(result).toEqual({ url: expect.stringMatching(/^\/uploads\/[a-f0-9]{32}\.gif$/), mime: "image/gif", width: null, height: null });

    const served = await request(result.url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/gif");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(polyglot);
  });

  it("returns null dimensions for a PNG containing only its signature", async () => {
    const response = await upload("truncated.png", png.subarray(0, 8), "image/png");
    expect(response.status).toBe(201);
    const result = await response.json() as { width: number | null; height: number | null };
    expect(result).toMatchObject({ width: null, height: null });
  });

  it("returns null dimensions for a JPEG truncated after its SOF segment", async () => {
    const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
    const response = await upload("truncated.jpg", truncatedJpeg, "image/jpeg");
    expect(response.status).toBe(201);
    const result = await response.json() as { width: number | null; height: number | null };
    expect(result).toMatchObject({ width: null, height: null });
  });

  it("returns null dimensions when a WebP chunk declares more bytes than the file contains", async () => {
    const truncatedWebp = Buffer.alloc(30);
    truncatedWebp.write("RIFF", 0, "ascii");
    truncatedWebp.writeUInt32LE(22, 4);
    truncatedWebp.write("WEBP", 8, "ascii");
    truncatedWebp.write("VP8X", 12, "ascii");
    truncatedWebp.writeUInt32LE(11, 16);
    const response = await upload("truncated.webp", truncatedWebp, "image/webp");
    expect(response.status).toBe(201);
    const result = await response.json() as { width: number | null; height: number | null };
    expect(result).toMatchObject({ width: null, height: null });
  });

  it("keeps dimensions for a structurally complete minimal GIF", async () => {
    const response = await upload("pixel.gif", gif, "image/gif");
    expect(response.status).toBe(201);
    const result = await response.json() as { width: number | null; height: number | null };
    expect(result).toMatchObject({ width: 1, height: 1 });
  });

  it("stores identical uploaded bytes under distinct generated names", async () => {
    const firstResponse = await upload("first.png", png, "image/png");
    const secondResponse = await upload("second.png", png, "image/png");
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    const first = await firstResponse.json() as { url: string };
    const second = await secondResponse.json() as { url: string };
    expect(first.url).not.toBe(second.url);
    expect(readFileSync(join(uploadsDirectory, first.url.slice("/uploads/".length)))).toEqual(png);
    expect(readFileSync(join(uploadsDirectory, second.url.slice("/uploads/".length)))).toEqual(png);
  });

  it("stores in a deterministic temporary directory for an in-memory database", async () => {
    const memoryDb = createDb(":memory:");
    const isolatedCwd = mkdtempSync(join(tmpdir(), "chub-memory-cwd-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(isolatedCwd);
    try {
      const response = await app.request("/api/uploads", multipartRequest("pixel.png", png, "image/png"), { db: memoryDb });
      expect(response.status).toBe(201);
      const result = await response.json() as { url: string };
      const storedPath = join(tmpdir(), "chub", "uploads", result.url.slice("/uploads/".length));
      expect(existsSync(storedPath)).toBe(true);
      expect(readFileSync(storedPath)).toEqual(png);
      expect(existsSync(join(isolatedCwd, "uploads"))).toBe(false);
    } finally {
      cwdSpy.mockRestore();
      memoryDb.$client.close();
    }
  });

  it("returns null dimensions when a recognized WebP header has no dimension chunk", async () => {
    const incompleteWebp = Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBP", "binary");
    const response = await upload("unknown.webp", incompleteWebp, "image/webp");
    expect(response.status).toBe(201);
    const raw = await response.text();
    const result = JSON.parse(raw) as { url: string; mime: string; width: number | null; height: number | null };
    expect(raw).toBe(JSON.stringify(result));
    expect(result).toEqual({ url: expect.stringMatching(/^\/uploads\/[a-f0-9]{32}\.webp$/), mime: "image/webp", width: null, height: null });
  });
});
