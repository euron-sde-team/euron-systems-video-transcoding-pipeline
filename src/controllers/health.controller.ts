import type { Request, Response } from "express";
import { NotFoundError } from "../errors/not-found.error";
import { sendSuccessResponse } from "../utils/response.util";

export const health = async (_req: Request, res: Response) => {
  sendSuccessResponse({
    res,
    data: { service: "euron-video-pipeline", status: "ok", time: new Date().toISOString() },
    statusCode: 200,
    message: "Healthy",
  });
};

export const notFound = async (req: Request, _res: Response) => {
  throw new NotFoundError(`Route not found: ${req.method} ${req.path}`);
};
