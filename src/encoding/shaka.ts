import config from "../config";
import { run } from "./exec";
import type { Rung } from "./ladder";

export interface PackageInput {
  /** Directory the packager runs in; all manifest/segment paths are relative to it. */
  outputDir: string;
  videoFiles: { rung: Rung; file: string }[];
  audioFile: string | null;
  captions: { vttFile: string; lang: string } | null;
  key: { kidHex: string; keyHex: string };
  /**
   * Key URI baked into the HLS manifest for Apple native-HLS direct play.
   * Per-viewer tokens can't be baked at packaging time, so native direct-play
   * needs per-request manifest rewriting; the Shaka (MSE) path uses clearKeys
   * via the authed JSON key endpoint instead and ignores this URI.
   */
  hlsKeyUri?: string;
}

export interface PackageResult {
  hlsMaster: string;
  dashManifest: string;
}

const DRM_LABEL = "ALL";

/**
 * Build + run Shaka Packager: CMAF (fragmented MP4) segments, cbcs raw-key
 * encryption with a single content key, and BOTH an HLS master playlist and a
 * DASH MPD pointing at the SAME segment tree (the single-copy benefit).
 */
export const packageCmaf = async (input: PackageInput): Promise<PackageResult> => {
  const args: string[] = [];

  // Encrypted video rungs, each to its own init + numbered media segments.
  for (const { rung, file } of input.videoFiles) {
    args.push(
      `in=${file},stream=video,` +
        `init_segment=video/${rung.name}/init.mp4,` +
        `segment_template=video/${rung.name}/$Number$.m4s,` +
        `drm_label=${DRM_LABEL}`
    );
  }

  // Encrypted audio (shared across rungs).
  if (input.audioFile) {
    args.push(
      `in=${input.audioFile},stream=audio,` +
        "init_segment=audio/init.mp4," +
        "segment_template=audio/$Number$.m4s," +
        `drm_label=${DRM_LABEL}`
    );
  }

  // Captions, NOT encrypted.
  if (input.captions) {
    const { lang } = input.captions;
    args.push(
      `in=${input.captions.vttFile},stream=text,` +
        `segment_template=text/${lang}/$Number$.vtt,` +
        `language=${lang}`
    );
  }

  args.push(
    "--segment_duration", "4",
    "--fragment_duration", "4",
    "--protection_scheme", "cbcs",
    "--enable_raw_key_encryption",
    "--keys", `label=${DRM_LABEL}:key_id=${input.key.kidHex}:key=${input.key.keyHex}`,
    "--hls_master_playlist_output", "master.m3u8",
    "--mpd_output", "manifest.mpd"
  );

  if (input.hlsKeyUri) {
    args.push("--hls_key_uri", input.hlsKeyUri);
  }

  // Run inside outputDir so all relative output paths land under output_prefix.
  await run(config.SHAKA_PACKAGER_BIN, args, "shaka-packager", { cwd: input.outputDir });

  return { hlsMaster: "master.m3u8", dashManifest: "manifest.mpd" };
};
