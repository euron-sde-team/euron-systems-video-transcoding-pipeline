import { Router } from "express";
import {
  cancelVideo,
  completeUpload,
  createUpload,
  getVideo,
  listVideos,
  mintPlaybackToken,
  renameVideo,
  retryVideo,
} from "../controllers/videos.controller";
import { getVideoKey } from "../controllers/key.controller";
import { requirePlaybackToken, requireServiceAuth } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asynchandler";

const router = Router();

// ─── Management API (service-to-service auth) ────────────────────────────────
router.post("/uploads", asyncHandler(requireServiceAuth), asyncHandler(createUpload));
router.get("/", asyncHandler(requireServiceAuth), asyncHandler(listVideos));
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

// ─── Key delivery (viewer playback token, NOT the service key) ──────────────
router.get("/:id/key", asyncHandler(requirePlaybackToken), asyncHandler(getVideoKey));

export default router;
