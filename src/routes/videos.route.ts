import { Router } from "express";
import {
  cancelVideo,
  completeUpload,
  createUpload,
  getDownload,
  getVideo,
  getVideosStorage,
  listVideos,
  mintPlaybackToken,
  renameVideo,
  retryVideo,
} from "../controllers/videos.controller";
import { getHlsMaster, getHlsVariant } from "../controllers/hls.controller";
import { getVideoKey } from "../controllers/key.controller";
import { requirePlaybackToken, requireServiceAuth } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asynchandler";

const router = Router();

// ─── Management API (service-to-service auth) ────────────────────────────────
router.post("/uploads", asyncHandler(requireServiceAuth), asyncHandler(createUpload));
router.get("/", asyncHandler(requireServiceAuth), asyncHandler(listVideos));
// Batch live R2 storage for the dashboard's visible cards. Registered before
// "/:id" so the static "storage" segment is never captured as an id.
router.post("/storage", asyncHandler(requireServiceAuth), asyncHandler(getVideosStorage));
router.get("/:id", asyncHandler(requireServiceAuth), asyncHandler(getVideo));
router.patch("/:id", asyncHandler(requireServiceAuth), asyncHandler(renameVideo));
router.post("/:id/complete", asyncHandler(requireServiceAuth), asyncHandler(completeUpload));
router.post("/:id/retry", asyncHandler(requireServiceAuth), asyncHandler(retryVideo));
router.post("/:id/cancel", asyncHandler(requireServiceAuth), asyncHandler(cancelVideo));
router.post(
  "/:id/playback-token",
  asyncHandler(requireServiceAuth),
  asyncHandler(mintPlaybackToken)
);
// Processed downloadable MP4: short-lived presigned URL (private upload bucket).
router.get("/:id/download", asyncHandler(requireServiceAuth), asyncHandler(getDownload));

// ─── Key delivery (viewer playback token, NOT the service key) ──────────────
router.get("/:id/key", asyncHandler(requirePlaybackToken), asyncHandler(getVideoKey));

// ─── AES-128 HLS manifests for native Safari (rewritten per request) ────────
// Master registered before the variant route so "master.m3u8" is never captured
// as a `:rung`.
router.get(
  "/:id/hls/master.m3u8",
  asyncHandler(requirePlaybackToken),
  asyncHandler(getHlsMaster)
);
router.get(
  "/:id/hls/:rung/index.m3u8",
  asyncHandler(requirePlaybackToken),
  asyncHandler(getHlsVariant)
);

export default router;
