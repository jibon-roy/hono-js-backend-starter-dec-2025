import { Hono } from "hono";
import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import {
  createFileUploadMiddleware,
  createMultiFileUploadMiddleware,
} from "../../middlewares/fileUpload";

const uploadRoute = new Hono();

// POST /api/v1/uploads
// multipart/form-data
// field: file
uploadRoute.post(
  "/",
  createFileUploadMiddleware({
    fieldName: "file",
    subDir: "posts",
    // bump if you expect large videos
    maxBytes: 250 * 1024 * 1024,
    allowedFormats: ["jpeg", "png", "webp", "gif", "mp4"],
    optimizeImages: true,
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 80,
    // Optionally force smaller output format:
    // outputImageFormat: "webp",
  }),
  (c) => {
    const uploadedFile = c.get("uploadedFile");
    const url = uploadedFile?.url;
    return sendResponse(c, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "File uploaded successfully",
      data: { url, file: uploadedFile },
    });
  }
);

// POST /api/v1/uploads/multiple
// multipart/form-data
// field: files (multiple)
uploadRoute.post(
  "/multiple",
  createMultiFileUploadMiddleware({
    fieldName: "files",
    subDir: "posts",
    maxBytes: 250 * 1024 * 1024,
    allowedFormats: ["jpeg", "png", "webp", "gif", "mp4"],
    optimizeImages: true,
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 80,
  }),
  (c) => {
    const uploadedFiles = c.get("uploadedFiles") ?? [];
    const urls = uploadedFiles.map((f) => f.url);
    return sendResponse(c, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Files uploaded successfully",
      data: { urls, files: uploadedFiles },
    });
  }
);

export default uploadRoute;
