import { mkdir, rm } from "fs/promises";
import path from "path";
import config from "../../config";
import { markMp4Ready, setArtifactProcessing, type VideoJobRow } from "../../db/queue";
import { encodeDownloadFromSource } from "../../encoding/download-mux";
import { selectLadder } from "../../encoding/ladder";
import { probe } from "../../encoding/probe";
import videosRepository from "../../repositories/videos.repository";
import s3UploadService from "../../services/s3-upload.service";
import { processedDownloadKey } from "../../utils/const";
import logger from "../../utils/logger";
import { uploadProcessedDownload } from "../r2";

/**
 * DOWNLOAD background job (decoupled from PRIMARY). Re-downloads the source and
 * re-encodes a size-conscious MP4 scaled to the top rung, then uploads it to the
 * PRIVATE downloads bucket. Encoding from source (not a local rung) is required:
 * the streaming rungs are on R2 as AES-TS, not on this worker. Throws on failure so
 * the worker requeues ONLY this job (an already-done CAPTIONS job is untouched).
 */
export const runDownloadJob = async (job: VideoJobRow): Promise<void> => {
  const video = await videosRepository.findById(job.video_id);
  if (!video) throw new Error(`download job: video ${job.video_id} not found`);
  if (!video.source_key) throw new Error(`download job: video ${job.video_id} has no source_key`);

  await setArtifactProcessing(job.video_id, "DOWNLOAD");

  const jobDir = path.join(config.WORK_DIR, `dl-${job.id}`);
  const sourceDir = path.join(jobDir, "src");
  await mkdir(sourceDir, { recursive: true });

  try {
    const ext = video.source_key.split(".").pop() || "mp4";
    const inputPath = path.join(sourceDir, `original.${ext}`);
    await s3UploadService.downloadToFile(video.source_key, inputPath);

    const probed = await probe(inputPath);
    // Scale to the top rung's dimensions (same deterministic ladder PRIMARY used).
    const ladder = selectLadder(probed.orientation, probed.width, probed.height, probed.bitrateKbps);
    const top = ladder.reduce((best, cur) =>
      cur.width * cur.height > best.width * best.height ? cur : best
    );

    const processed = await encodeDownloadFromSource(
      inputPath,
      jobDir,
      top.scaleFilter,
      probed.hasAudio,
      probed.durationSec
    );
    await uploadProcessedDownload(processedDownloadKey(video.tenant_id, video.id), processed);

    await markMp4Ready(job.video_id);
    logger.info(`[download ${job.video_id}] ready`);
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  }
};
