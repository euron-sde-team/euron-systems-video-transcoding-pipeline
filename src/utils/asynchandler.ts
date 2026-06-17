import type { NextFunction, Request, Response } from "express";
import logger, { getLogDataFromReqObject } from "./logger";

/**
 * Wraps an async route handler so rejected promises reach the global error
 * middleware instead of crashing the process. Every handler/middleware in this
 * service is wrapped in asyncHandler (Euron convention).
 */
export const asyncHandler = (
  fnc: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    return Promise.resolve(fnc(req, res, next)).catch((err) => {
      try {
        const reqObjectData = getLogDataFromReqObject(req);
        logger.error(`${reqObjectData} , Err - ${err}`);
      } catch (logError) {
        logger.error(`Error logging request data: ${logError}, Original error: ${err}`);
      }
      next(err);
    });
  };
};
