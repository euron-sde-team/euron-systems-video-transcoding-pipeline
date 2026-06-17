import type { Response } from "express";
import type { IResponseFormat } from "../types/response.type";
import logger from "./logger";

/** HTTP success status codes. */
export enum HttpSuccessStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
}

/**
 * Standardized success envelope. Matches the SaaS backends' shape exactly so
 * clients/integrations don't need a second response parser when this service
 * is folded into the platform.
 */
export const sendSuccessResponse = <T>({
  res,
  data,
  statusCode = HttpSuccessStatus.OK,
  message,
}: {
  res: Response<IResponseFormat>;
  data: T;
  statusCode: number;
  message?: string;
}): void => {
  if (res.headersSent) {
    logger.warn("Attempted to send response after headers were already sent");
    return;
  }
  if (!res.writable) {
    logger.warn("Attempted to send response to a closed connection");
    return;
  }

  const defaultMessages: Record<number, string> = {
    [HttpSuccessStatus.OK]: "Request successful",
    [HttpSuccessStatus.CREATED]: "Resource created successfully",
    [HttpSuccessStatus.ACCEPTED]: "Request accepted",
    [HttpSuccessStatus.NO_CONTENT]: "Request processed successfully",
  };

  res.status(statusCode).json({
    data,
    statusCode,
    message: message || defaultMessages[statusCode] || "Request successful",
    success: true,
  });
};
