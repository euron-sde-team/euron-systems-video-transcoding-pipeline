import type { Request } from "express";
import { createLogger, format, transports } from "winston";
import config from "../config";

/**
 * Single-file Winston logger. Console transport with timestamps. CloudWatch can
 * be layered later (the SaaS backends use winston-aws-cloudwatch); kept minimal
 * here so the standalone service has no AWS log dependency at boot.
 */
const logger = createLogger({
  level: config.isProduction ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const base = `${timestamp} [${level.toUpperCase()}] ${message}`;
      return stack ? `${base}\n${stack}` : base;
    })
  ),
  transports: [new transports.Console()],
});

/**
 * Redacted request summary for error logs. Never logs password/secretKey/token.
 * Mirrors the SaaS backends' getLogDataFromReqObject so log shapes match.
 */
export const getLogDataFromReqObject = (req: Request): string => {
  try {
    if (!req) return "(request object data Not Found)";
    const ip = req.headers?.["x-forwarded-for"] || req.ip || req.socket?.remoteAddress;
    const path = req.path;

    let params = "(unavailable)";
    let query = "(unavailable)";
    try {
      params = JSON.stringify(req.params || {});
    } catch {
      /* Express 5 getter issues, ignore */
    }
    try {
      query = JSON.stringify(req.query ? { ...req.query } : {});
    } catch {
      /* ignore */
    }

    const body = { ...req.body };
    delete body?.password;
    delete body?.secretKey;
    delete body?.token;
    delete body?.authProviderToken;
    return `IP - ${ip}, Path - ${path}, Body - ${JSON.stringify(body)}, Params - ${params}, Query - ${query}`;
  } catch (error) {
    logger.error(`getLogDataFromReqObject error - ${error}`);
    return "(request object data Not Found)";
  }
};

export default logger;
