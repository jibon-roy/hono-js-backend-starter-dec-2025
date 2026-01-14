import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { Readable } from "node:stream";
import type { MiddlewareHandler } from "hono";
import httpStatus from "http-status";
import ApiError from "../../error/ApiErrors";
import sharp from "sharp";
import { config } from "../../config";

export type AllowedUploadFormat =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "pdf"
  | "mp4";

export type StoredUploadFile = {
  fieldName: string;
  originalName: string;
  mimeType: string;
  detectedFormat: AllowedUploadFormat;
  originalSize: number;
  storedSize: number;
  uploadRoot: string;
  subDir: string;
  filename: string;
  relativePath: string;
  url: string;
  absolutePath: string;
  optimized: boolean;
  outputFormat: AllowedUploadFormat;
};

type FileUploadOptions = {
  fieldName?: string;
  maxBytes?: number;
  uploadRoot?: string;
  subDir?: string | ((c: Parameters<MiddlewareHandler>[0]) => string);
  allowedFormats?: AllowedUploadFormat[];
  // Image optimization (real size reduction).
  // For non-image formats (pdf/mp4) the file is stored as-is.
  optimizeImages?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  // Only applies to jpeg/webp outputs.
  quality?: number;
  // If set, images will be re-encoded to this format for smaller output.
  // Default: keep original format.
  outputImageFormat?: "jpeg" | "webp" | "png";
};

const DEFAULT_ALLOWED: AllowedUploadFormat[] = ["jpeg", "png", "gif", "webp"];

const sanitizePathSegment = (segment: string) => {
  const value = segment.trim();
  if (!value) return "";
  if (value === "." || value === "..") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid upload sub-directory");
  }
  // Allow nested paths by validating each segment separately.
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Upload sub-directory contains invalid characters"
    );
  }
  return value;
};

const sanitizeRelativeSubDir = (subDir: string) => {
  const normalized = subDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";

  const parts = normalized
    .split("/")
    .map((p) => sanitizePathSegment(p))
    .filter(Boolean);

  return parts.join(path.sep);
};

const bytesEqual = (buf: Uint8Array, signature: number[], offset = 0) => {
  if (buf.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buf[offset + i] !== signature[i]) return false;
  }
  return true;
};

const detectFormat = (header: Uint8Array): AllowedUploadFormat | null => {
  // JPEG: FF D8 FF
  if (bytesEqual(header, [0xff, 0xd8, 0xff])) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytesEqual(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  // GIF: GIF87a / GIF89a
  if (
    bytesEqual(header, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    bytesEqual(header, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "gif";
  }

  // WEBP: RIFF .... WEBP
  if (
    bytesEqual(header, [0x52, 0x49, 0x46, 0x46]) &&
    bytesEqual(header, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }

  // PDF: %PDF-
  if (bytesEqual(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";

  // MP4 (very rough): .... ftyp
  if (bytesEqual(header, [0x66, 0x74, 0x79, 0x70], 4)) return "mp4";

  return null;
};

const extForFormat = (format: AllowedUploadFormat) => {
  switch (format) {
    case "jpeg":
      return ".jpg";
    case "png":
      return ".png";
    case "gif":
      return ".gif";
    case "webp":
      return ".webp";
    case "pdf":
      return ".pdf";
    case "mp4":
      return ".mp4";
  }
};

const mimeForFormat = (format: AllowedUploadFormat) => {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "mp4":
      return "video/mp4";
  }
};

const createMaxBytesTransform = (maxBytes: number) => {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      seen += (chunk as Buffer).length;
      if (seen > maxBytes) {
        cb(new ApiError(413, "File too large"));
        return;
      }
      cb(null, chunk);
    },
  });
};

const normalizeBaseUrl = (value?: string) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.replace(/\/+$/, "") : "";
};

const getBaseOrigin = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    // If baseUrl isn't a full URL, fall back to empty (root-relative URLs).
    return "";
  }
};

const buildPublicUrl = (relativePath: string) => {
  const base =
    normalizeBaseUrl(config.url.image_url) ||
    normalizeBaseUrl(config.url.backend_url);

  const cleanedPath = relativePath.replace(/^\/+/, "");
  const origin = base ? getBaseOrigin(base) : "";

  // If no base/origin is configured, return a root-relative path.
  return origin ? `${origin}/${cleanedPath}` : `/${cleanedPath}`;
};

type StoreOneFileParams = {
  c: Parameters<MiddlewareHandler>[0];
  file: File;
  fieldName: string;
  maxBytes: number;
  uploadRoot: string;
  allowedFormats: AllowedUploadFormat[];
  subDir: FileUploadOptions["subDir"];
  optimizeImages: boolean;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  outputImageFormat?: FileUploadOptions["outputImageFormat"];
};

const storeOneFile = async (
  params: StoreOneFileParams
): Promise<StoredUploadFile> => {
  const {
    c,
    file,
    fieldName,
    maxBytes,
    uploadRoot,
    allowedFormats,
    subDir,
    optimizeImages,
    maxWidth,
    maxHeight,
    quality,
    outputImageFormat,
  } = params;

  if (typeof file.size === "number" && file.size > maxBytes) {
    throw new ApiError(413, "File too large");
  }

  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const detected = detectFormat(header);
  if (!detected) {
    throw new ApiError(
      httpStatus.UNSUPPORTED_MEDIA_TYPE,
      "Unsupported or unknown file format"
    );
  }

  if (!allowedFormats.includes(detected)) {
    throw new ApiError(
      httpStatus.UNSUPPORTED_MEDIA_TYPE,
      `Only ${allowedFormats.join(", ")} files are allowed`
    );
  }

  const rawSubDir = typeof subDir === "function" ? subDir(c) : subDir ?? "";
  const safeSubDir = sanitizeRelativeSubDir(rawSubDir);

  const destinationDir = path.join(uploadRoot, safeSubDir);
  await mkdir(destinationDir, { recursive: true });

  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const isImage =
    detected === "jpeg" ||
    detected === "png" ||
    detected === "webp" ||
    detected === "gif";

  const finalImageFormat = outputImageFormat ?? (detected as any);
  const shouldOptimize = optimizeImages && isImage;

  const outputFormat: AllowedUploadFormat = shouldOptimize
    ? (finalImageFormat as AllowedUploadFormat)
    : detected;

  const storedName = `${id}${extForFormat(outputFormat)}`;
  const absolutePath = path.join(destinationDir, storedName);

  const fileStream = Readable.fromWeb(file.stream() as any);
  const writeStream = createWriteStream(absolutePath);

  if (
    shouldOptimize &&
    (outputFormat === "jpeg" ||
      outputFormat === "webp" ||
      outputFormat === "png")
  ) {
    const transformer = sharp({ failOn: "none" }).rotate().resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (outputFormat === "jpeg") {
      transformer.jpeg({ quality, mozjpeg: true });
    } else if (outputFormat === "webp") {
      transformer.webp({ quality });
    } else {
      transformer.png({ compressionLevel: 9, palette: true });
    }

    await pipeline(
      fileStream,
      createMaxBytesTransform(maxBytes),
      transformer,
      writeStream
    );
  } else {
    await pipeline(fileStream, createMaxBytesTransform(maxBytes), writeStream);
  }

  const relativePath = path
    .join("upload", safeSubDir, storedName)
    .replace(/\\/g, "/");

  const storedStat = await stat(absolutePath);

  return {
    fieldName,
    originalName: file.name,
    mimeType: file.type || mimeForFormat(detected),
    detectedFormat: detected,
    originalSize: file.size,
    storedSize: storedStat.size,
    uploadRoot,
    subDir: safeSubDir.replace(/\\/g, "/"),
    filename: storedName,
    relativePath,
    url: buildPublicUrl(relativePath),
    absolutePath,
    optimized: shouldOptimize,
    outputFormat,
  };
};

export const createFileUploadMiddleware = (
  opts: FileUploadOptions = {}
): MiddlewareHandler => {
  const fieldName = opts.fieldName ?? "file";
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024; // 10MB default
  const uploadRoot = opts.uploadRoot ?? path.resolve(process.cwd(), "upload");
  const allowedFormats = opts.allowedFormats ?? DEFAULT_ALLOWED;
  const optimizeImages = opts.optimizeImages ?? true;
  const maxWidth = opts.maxWidth ?? 1920;
  const maxHeight = opts.maxHeight ?? 1920;
  const quality = opts.quality ?? 80;
  const outputImageFormat = opts.outputImageFormat;

  return async (c, next) => {
    const parsed = await c.req.parseBody();
    const rawValue = (parsed as any)?.[fieldName];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

    if (!value) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Missing file field '${fieldName}'`
      );
    }

    if (!(value instanceof File)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Field '${fieldName}' must be a file`
      );
    }

    const stored = await storeOneFile({
      c,
      file: value as File,
      fieldName,
      maxBytes,
      uploadRoot,
      allowedFormats,
      subDir: opts.subDir,
      optimizeImages,
      maxWidth,
      maxHeight,
      quality,
      outputImageFormat,
    });

    c.set("uploadedFile", stored);
    await next();
  };
};

export const createMultiFileUploadMiddleware = (
  opts: FileUploadOptions = {}
): MiddlewareHandler => {
  const fieldName = opts.fieldName ?? "files";
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const uploadRoot = opts.uploadRoot ?? path.resolve(process.cwd(), "upload");
  const allowedFormats = opts.allowedFormats ?? DEFAULT_ALLOWED;
  const optimizeImages = opts.optimizeImages ?? true;
  const maxWidth = opts.maxWidth ?? 1920;
  const maxHeight = opts.maxHeight ?? 1920;
  const quality = opts.quality ?? 80;
  const outputImageFormat = opts.outputImageFormat;

  return async (c, next) => {
    const parsed = await c.req.parseBody();
    const rawValue = (parsed as any)?.[fieldName];
    const values = Array.isArray(rawValue)
      ? rawValue
      : rawValue
      ? [rawValue]
      : [];

    if (values.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Missing file field '${fieldName}'`
      );
    }

    for (const v of values) {
      if (!(v instanceof File)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Field '${fieldName}' must be file(s)`
        );
      }
    }

    const storedFiles: StoredUploadFile[] = [];
    for (const v of values as File[]) {
      const stored = await storeOneFile({
        c,
        file: v,
        fieldName,
        maxBytes,
        uploadRoot,
        allowedFormats,
        subDir: opts.subDir,
        optimizeImages,
        maxWidth,
        maxHeight,
        quality,
        outputImageFormat,
      });
      storedFiles.push(stored);
    }

    c.set("uploadedFiles", storedFiles);
    await next();
  };
};
