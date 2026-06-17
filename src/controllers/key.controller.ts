import type { Request, Response } from "express";
import { ForbiddenError } from "../errors/forbidden.error";
import { NotFoundError } from "../errors/not-found.error";
import contentKeyService from "../services/content-key.service";

/**
 * GET /videos/:id/key  (playback token required)
 *
 * The real security boundary for clear-key. The token (verified by
 * requirePlaybackToken) must be bound to THIS video and tenant. Two response
 * shapes:
 *   - default JSON → Shaka clearKeys ({kid,k} base64url + a hex clearKeys map).
 *   - ?format=raw  → the 16 raw key bytes (application/octet-stream) for Apple
 *     native HLS, whose #EXT-X-KEY URI fetches the key directly.
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

  if (req.query.format === "raw") {
    res.set("Content-Type", "application/octet-stream");
    res.status(200).send(key.keyBytes);
    return;
  }

  const kidBytes = Buffer.from(key.kidHex, "hex");
  res.status(200).json({
    // W3C Clear Key (base64url), what the guide injects via drm.clearKeys.
    kid: kidBytes.toString("base64url"),
    k: key.keyBytes.toString("base64url"),
    // Convenience hex map for Shaka's clearKeys config.
    clearKeys: { [key.kidHex]: key.keyHex },
  });
};
