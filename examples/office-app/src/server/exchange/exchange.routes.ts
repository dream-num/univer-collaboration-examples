import express, { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import multer from "multer";
import type { User } from "../../shared/api-types";
import type { ExchangeService } from "./exchange.service";
import { decodeMultipartFilename } from "./formats";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function createExchangeRouter(options: {
  service: ExchangeService;
  requireUser: (request: Request, response: Response) => User | undefined;
}): ExpressRouter {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  router.post("/import", upload.single("file"), async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    if (!request.file)
      return void response.status(400).json({ code: "FILE_REQUIRED" });

    const unit = await options.service.importFile({
      userId: user.userId,
      type: Number(request.body.type),
      originalName: decodeMultipartFilename(request.file.originalname),
      data: request.file.buffer,
    });
    response.status(201).json({ unit });
  });

  router.get("/units/:unitId/export", async (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const result = await options.service.exportFile({
      userId: user.userId,
      unitId: request.params.unitId,
      format: String(request.query.format ?? "").toLowerCase(),
    });
    response
      .type(result.contentType)
      .set("Content-Disposition", contentDisposition(result.filename))
      .send(result.data);
  });

  return router;
}

export function createExchangeProtocolRouter(options: {
  service: ExchangeService;
  requireUser: (request: Request, response: Response) => User | undefined;
}): ExpressRouter {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  router.post("/stream/file/upload", upload.any(), (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const file = Array.isArray(request.files) ? request.files[0] : undefined;
    if (!file)
      return void response.status(400).json({ code: "FILE_REQUIRED" });
    const result = options.service.uploadProtocolFile({
      userId: user.userId,
      originalName: decodeMultipartFilename(file.originalname),
      contentType: file.mimetype,
      data: file.buffer,
      compressed: String(request.query.flate) === "true",
    });
    response.json(result);
  });

  router.post(
    "/exchange/:type/import",
    express.json({ limit: "1mb" }),
    async (request, response) => {
      const user = options.requireUser(request, response);
      if (!user) return;
      response.json(await options.service.importProtocolFile({
        userId: user.userId,
        type: Number(request.params.type),
        body: request.body,
      }));
    },
  );
  router.post(
    "/exchange/:type/export",
    express.json({ limit: "1mb" }),
    async (request, response) => {
      const user = options.requireUser(request, response);
      if (!user) return;
      response.json(await options.service.exportProtocolFile({
        userId: user.userId,
        type: Number(request.params.type),
        body: request.body,
      }));
    },
  );
  router.get("/exchange/task/:taskID", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    response.set("Cache-Control", "private, no-store").json(
      options.service.getProtocolTask(user.userId, request.params.taskID),
    );
  });
  router.get("/file/:fileID/sign-url", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const result = options.service.signProtocolFile(user.userId, request.params.fileID);
    if (!result) return void response.status(404).json({ code: "FILE_NOT_FOUND" });
    response.set("Cache-Control", "private, no-store").json(result);
  });
  router.get("/file/:fileID/content", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const artifact = options.service.readProtocolFile(user.userId, request.params.fileID);
    if (!artifact) return void response.status(404).json({ code: "FILE_NOT_FOUND" });
    response
      .type(artifact.contentType)
      .set("Content-Disposition", contentDisposition(artifact.filename))
      .set("Cache-Control", "private, no-store")
      .send(artifact.data);
  });

  return router;
}

function contentDisposition(filename: string) {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
