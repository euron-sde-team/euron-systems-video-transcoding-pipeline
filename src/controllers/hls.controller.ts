import type { Request, Response } from "express";
import config from "../config";
import { BadRequestError } from "../errors/bad-request.error";
import { ForbiddenError } from "../errors/forbidden.error";
import { NotFoundError } from "../errors/not-found.error";
import { UnauthorizedError } from "../errors/unauthorized.error";
import { getObjectText } from "../services/r2-read.service";
import videosService from "../services/videos.service";
import { HLS_AES_KEY_URI_PLACEHOLDER } from "../utils/const";

/**
 * Native-Safari AES-128 HLS manifest delivery.
 *
 * Safari plays the AES-128/TS tree NATIVELY, fetching the EXT-X-KEY URI and the
 * variant/segment URIs itself with NO ability to set an Authorization header. The
 * playback token is per-viewer + short-TTL, so it must ride in the manifest URLs.
 * These routes therefore fetch the stored playlists from R2 and REWRITE them per
 * request: variant + key URIs get the validated token; segment URIs point at the
 * public CDN (the AES segments are encrypted, the key endpoint is the gate). The
 * served manifests are no-store (they carry a per-viewer token).
 */

/** The verified-but-raw token string (for injecting back into URLs). */
const tokenOf = (req: Request): string => {
  const q = req.query.token;
  if (typeof q === "string" && q) return q;
  const header = req.headers.authorization;
  if (header) {
    const [scheme, value] = header.split(" ");
    if (scheme === "Bearer" && value) return value;
  }
  throw new UnauthorizedError("Playback token required");
};

const apiBaseOf = (req: Request): string => {
  const fromCfg = config.PUBLIC_API_BASE.replace(/\/+$/, "");
  return fromCfg || `${req.protocol}://${req.get("host")}`;
};

const cdnBase = (): string => config.R2_PUBLIC_BASE.replace(/\/+$/, "");

const manifestHeaders = (res: Response): void => {
  res.set("Content-Type", "application/vnd.apple.mpegurl");
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
};

/** GET /videos/:id/hls/master.m3u8  (playback token required) */
export const getHlsMaster = async (req: Request, res: Response) => {
  const claims = req.playback;
  const id = req.params.id as string;
  if (!claims) throw new ForbiddenError("Missing playback token");
  if (claims.videoId !== id) throw new ForbiddenError("Token not valid for this video");

  const token = tokenOf(req);
  const prefix = await videosService.getOutputPrefixForPlayback(claims.tenantId, id);
  const body = await getObjectText(`${prefix}/hls-aes/master.m3u8`);
  if (body === null) throw new NotFoundError("Manifest not found");

  const apiBase = apiBaseOf(req);
  const cdn = cdnBase();

  const out = body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // Subtitle rendition URI (EXT-X-MEDIA ... URI="subs/xx.m3u8") → public CDN.
        if (trimmed.startsWith("#EXT-X-MEDIA") && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/, (_m, u) => `URI="${cdn}/${prefix}/hls-aes/${u}"`);
        }
        return line;
      }
      // A variant URI line ("720/index.m3u8") → absolute, tokenized API URL.
      return `${apiBase}/api/v1/videos/${id}/hls/${trimmed}?token=${encodeURIComponent(token)}`;
    })
    .join("\n");

  manifestHeaders(res);
  res.status(200).send(out);
};

/** GET /videos/:id/hls/:rung/index.m3u8  (playback token required) */
export const getHlsVariant = async (req: Request, res: Response) => {
  const claims = req.playback;
  const id = req.params.id as string;
  const rung = req.params.rung as string;
  if (!claims) throw new ForbiddenError("Missing playback token");
  if (claims.videoId !== id) throw new ForbiddenError("Token not valid for this video");
  // Allowlist the rung label so it can never traverse into another R2 key.
  if (!/^[0-9]{2,4}$/.test(rung)) throw new BadRequestError("Invalid rung");

  const token = tokenOf(req);
  const prefix = await videosService.getOutputPrefixForPlayback(claims.tenantId, id);
  const body = await getObjectText(`${prefix}/hls-aes/${rung}/index.m3u8`);
  if (body === null) throw new NotFoundError("Manifest not found");

  const apiBase = apiBaseOf(req);
  const cdn = cdnBase();
  const keyUrl = `${apiBase}/api/v1/videos/${id}/key?format=raw&token=${encodeURIComponent(token)}`;

  const out = body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // Inject the authed key URL into EXT-X-KEY (replaces the baked sentinel).
        if (trimmed.includes(HLS_AES_KEY_URI_PLACEHOLDER)) {
          return line.replace(HLS_AES_KEY_URI_PLACEHOLDER, keyUrl);
        }
        return line;
      }
      // A segment line ("seg_000.ts") → absolute CDN URL.
      return `${cdn}/${prefix}/hls-aes/${rung}/${trimmed}`;
    })
    .join("\n");

  manifestHeaders(res);
  res.status(200).send(out);
};
