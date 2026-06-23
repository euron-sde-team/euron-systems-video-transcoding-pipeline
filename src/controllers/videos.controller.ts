import type { Request, Response } from "express";
import { BadRequestError } from "../errors/bad-request.error";
import { getTenantId } from "../middlewares/auth.middleware";
import videosService from "../services/videos.service";
import { HttpSuccessStatus, sendSuccessResponse } from "../utils/response.util";

export const createUpload = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const filename = String(req.body?.filename ?? "");
  if (!filename) throw new BadRequestError("filename is required");
  const title = req.body?.title ? String(req.body.title) : undefined;
  const result = await videosService.createUpload(tenantId, filename, title);
  sendSuccessResponse({
    res,
    data: result,
    statusCode: HttpSuccessStatus.CREATED,
    message: "Upload created",
  });
};

export const completeUpload = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const result = await videosService.completeUpload(tenantId, req.params.id as string);
  sendSuccessResponse({ res, data: result, statusCode: HttpSuccessStatus.OK, message: "Upload completed" });
};

export const getVideo = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const result = await videosService.getVideo(tenantId, req.params.id as string);
  sendSuccessResponse({ res, data: result, statusCode: HttpSuccessStatus.OK, message: "Video retrieved" });
};

export const listVideos = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
  const status = req.query.status ? String(req.query.status) : undefined;
  const result = await videosService.listVideos(tenantId, { page, limit, status });
  sendSuccessResponse({ res, data: result, statusCode: HttpSuccessStatus.OK, message: "Videos retrieved" });
};

export const retryVideo = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const result = await videosService.retry(tenantId, req.params.id as string);
  sendSuccessResponse({ res, data: result, statusCode: HttpSuccessStatus.OK, message: "Video requeued" });
};

export const cancelVideo = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const result = await videosService.cancel(tenantId, req.params.id as string);
  sendSuccessResponse({ res, data: result, statusCode: HttpSuccessStatus.OK, message: "Video cancelled" });
};

export const renameVideo = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const title = String(req.body?.title ?? "").trim();
  if (!title) throw new BadRequestError("title is required");
  const result = await videosService.rename(tenantId, req.params.id as string, title);
  sendSuccessResponse({ res, data: result, statusCode: HttpSuccessStatus.OK, message: "Video renamed" });
};

export const getDownload = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const result = await videosService.getProcessedDownloadUrl(tenantId, req.params.id as string);
  sendSuccessResponse({
    res,
    data: result,
    statusCode: HttpSuccessStatus.OK,
    message: "Download URL minted",
  });
};

export const mintPlaybackToken = async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = String(req.body?.userId ?? "");
  if (!userId) throw new BadRequestError("userId is required");
  const ttlSeconds = req.body?.ttlSeconds ? Number(req.body.ttlSeconds) : undefined;
  const result = await videosService.mintPlaybackToken(
    tenantId,
    req.params.id as string,
    userId,
    ttlSeconds
  );
  sendSuccessResponse({
    res,
    data: result,
    statusCode: HttpSuccessStatus.CREATED,
    message: "Playback token minted",
  });
};
