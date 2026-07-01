// PORTED: now also lives in euron-systems-user-server/src/controllers/
// vod-key.controller.ts (AES key delivery served under the SaaS /vod routes).
// Kept here for reference / standalone operator use (deprecate-don't-delete).
import type { Request, Response } from "express";
import { ForbiddenError } from "../errors/forbidden.error";
import { NotFoundError } from "../errors/not-found.error";
import contentKeyService from "../services/content-key.service";

/**
 * GET /videos/:id/key  (playback token required)
 *
 * The real security boundary for clear-key. The token (verified by
 * requirePlaybackToken) must be bound to THIS video and tenant.
 *   - Always serves the 16 raw key bytes (application/octet-stream). Both native
 *     Safari/iOS HLS and hls.js fetch the key directly from the #EXT-X-KEY URI.
 * NOT IN USE (HLS-only migration): the default JSON response (Shaka clearKeys for
 * the MSE/ClearKey path) is retained below but commented out; nothing uses it now.
 *
 * NOTE: AES-128 clear-key is DETERRENCE, not DRM. A logged-in user with devtools
 * can still capture the key. Never describe this as protection in UI/comments.
 */
export const getVideoKey = async (req: Request, res: Response) => {
  const claims = req.playback;
  const videoId = req.params.id as string;

  if (!claims) throw new ForbiddenError("Missing playback token");
  if (claims.videoId !== videoId) throw new ForbiddenError("Token not valid for this video");

  const key = await contentKeyService.getForPlayback(claims.tenantId, videoId);
  if (!key) throw new NotFoundError("No content key for this video");

  // The key must never be cached by the browser or any intermediary.
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");

  // AES-128 HLS: always serve the raw 16 key bytes. Both native Safari/iOS and
  // hls.js fetch this directly from the manifest's #EXT-X-KEY URI (?format=raw).
  res.set("Content-Type", "application/octet-stream");
  res.status(200).send(key.keyBytes);

  // NOT IN USE (HLS-only migration): Shaka clearKeys JSON (MSE/ClearKey path).
  // const kidBytes = Buffer.from(key.kidHex, "hex");
  // res.status(200).json({
  //   kid: kidBytes.toString("base64url"),
  //   k: key.keyBytes.toString("base64url"),
  //   clearKeys: { [key.kidHex]: key.keyHex },
  // });
};
