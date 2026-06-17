import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import config from "../config";
import { ForbiddenError } from "../errors/forbidden.error";
import { UnauthorizedError } from "../errors/unauthorized.error";
import playbackTokenService from "../services/playback-token.service";

const extractBearer = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme === "Bearer" && value ? value : undefined;
};

/** Constant-time string compare to avoid leaking the service key via timing. */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/**
 * Service-to-service auth for the management API (uploads, complete, list,
 * retry, token mint). Accepts the shared secret via `Authorization: Bearer` or
 * `X-Service-Key`. Tenant context comes from `X-Tenant-Id`.
 */
export const requireServiceAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const provided = extractBearer(req) ?? (req.headers["x-service-key"] as string | undefined);
  if (!provided || !safeEqual(provided, config.SERVICE_API_KEY)) {
    throw new UnauthorizedError("Invalid service credentials");
  }
  req.service = true;
  const tenantId = req.headers["x-tenant-id"] as string | undefined;
  if (tenantId) req.tenantId = tenantId;
  next();
};

/**
 * Playback-token auth for the key endpoint. Accepts the token via
 * `Authorization: Bearer` OR `?token=` query param, the query form is REQUIRED
 * for Apple native HLS, whose `#EXT-X-KEY` URI cannot carry an Authorization
 * header. Attaches verified claims to `req.playback`.
 */
export const requirePlaybackToken = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractBearer(req) ?? (req.query.token as string | undefined);
  if (!token) throw new UnauthorizedError("Playback token required");
  req.playback = playbackTokenService.verify(token);
  next();
};

/** Throws if the request has no tenant context. */
export const getTenantId = (req: Request): string => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new ForbiddenError("Tenant context required (X-Tenant-Id)");
  return tenantId;
};
