import type { NextFunction, Request } from "express";
import { customAlphabet } from "nanoid";
import config from "../config";
import { CustomError, type SerializedErrorOutput } from "../errors/custom.error";
import type { ResponseType } from "../types/response.type";
import logger from "../utils/logger";

const nanoid = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  18
);

/**
 * Global error handler. Custom errors → their statusCode + serialized message.
 * Unexpected errors → 500 (message hidden in production). Every response carries
 * a rayId for cross-log tracing, identical to the SaaS backends.
 */
export const globalHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  err: any,
  req: Request,
  res: ResponseType,
  _next: NextFunction
) => {
  if (res.headersSent || !res.writable) {
    logger.warn("Error handler: response not writable, cannot send error response");
    return;
  }

  if (err instanceof CustomError) {
    const serialized = err.serializeErrors();
    const error = (Array.isArray(serialized) ? serialized[0] : serialized) as SerializedErrorOutput &
      Record<string, unknown>;
    const rayId = nanoid();
    const message = `route: ${req.path}, errorMsg: ${error?.message || err.message}, rayId: ${rayId}`;
    logger.error(message);
    return res.status(err.statusCode).json({
      error: { ...error },
      statusCode: err.statusCode,
      message,
      success: false,
    });
  }

  if (err instanceof Error) {
    const rayId = nanoid();
    const message = `route: ${req.path}, errorMsg: ${err.message}, rayId: ${rayId}`;
    logger.error(message);
    return res.status(500).json({
      error: { message: config.isProduction ? "Internal Server Error" : err.message },
      statusCode: 500,
      message,
      success: false,
    });
  }

  const rayId = nanoid();
  return res.status(500).json({
    statusCode: 500,
    message: `route: ${req.path}, errorMsg: INTERNAL SERVER ERROR, rayId: ${rayId}`,
    success: false,
  });
};
