import { basename } from "node:path";
import express, { type Router } from "express";
import multer from "multer";
import { ErrorCode, type IError } from "@univerjs/protocol";
import type { FileStore } from "./file-store.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const OK: IError = { code: ErrorCode.OK, message: "" };

/**
 * File routes used by the Univer client image and attachment services
 * (`uploadFileServerUrl`, `signUrlServerUrl`, and `downloadEndpointUrl` in `web/univer/features/collaboration.ts`).
 * The shapes match the universer protocol: upload returns `{ FileId }`, sign-url returns `{ url }`
 * relative to the download endpoint, and download streams the bytes.
 */
export function createFileRouter(files: FileStore): Router {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    // Browsers send the file name as raw UTF-8; multer decodes it as latin1 unless told otherwise.
    defParamCharset: "utf8",
  });

  // Univer clients upload with `?size=<bytes>&source=<FileSource>&assign=<unitID>`. Images and
  // attachments inserted into a Unit send `FileSource.UnitEmbedded` and the Unit ID as `assign`;
  // see file-store.ts for which `source` values are temporary.
  router.post("/stream/file/upload", upload.single("file"), async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: protocolError(ErrorCode.UNDEFINED, "file is required") });
      return;
    }
    try {
      const stored = await files.save({
        data: request.file.buffer,
        fileName: basename(request.file.originalname) || "upload.bin",
        contentType: request.file.mimetype || "application/octet-stream",
        source: optionalString(request.query.source),
        assign: optionalString(request.query.assign),
      });
      response.json({ FileId: stored.fileID, error: OK });
    } catch (error) {
      response.status(500).json({
        error: protocolError(ErrorCode.INTERNAL_ERROR, errorMessage(error)),
      });
    }
  });

  router.get("/file/:fileID/sign-url", (request, response) => {
    const file = files.get(request.params.fileID);
    if (!file) {
      response.status(404).json({
        url: "",
        error: protocolError(ErrorCode.UNDEFINED, "File was not found"),
      });
      return;
    }
    // Unsigned local URL for teaching; a production application returns a time-limited signed URL.
    response.json({
      url: `/universer-api/file/${request.params.fileID}/download`,
      error: OK,
    });
  });

  router.get("/file/:fileID/download", (request, response, next) => {
    const file = files.get(request.params.fileID);
    if (!file) {
      response.sendStatus(404);
      return;
    }
    response
      .type(file.contentType)
      .set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
      // Serve relative to the store directory: `.data` is a dot segment that `sendFile` would otherwise refuse.
      .sendFile(file.fileID, { root: files.directory }, (error) => {
        if (error) next(error);
      });
  });

  return router;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function protocolError(code: ErrorCode, message: string): IError {
  return { code, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
