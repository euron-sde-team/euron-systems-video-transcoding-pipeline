# VdoCipher Catalog EDA (migration planning for the in-house VOD pipeline)

Date: 2026-06-22. Source: prod DB `euron_systems_prod_db` (read-only) plus the
VdoCipher account list/info API (authoritative durations, sizes, status).
All DB queries were run with `default_transaction_read_only=on` (server-enforced).

Two data sources, each used for what it is best at:

- **Size** comes from our DB (`tenant_video_storage.size_bytes`). It is
  near-complete and was cross-checked against VdoCipher's own `totalSizeBytes`
  (2,036.6 GiB in DB vs 2,040.8 GiB from VdoCipher, a 0.2% match).
- **Duration / status / age** come from the VdoCipher API. Our DB had duration
  for only 125 of 1,999 VdoCipher lectures (93.5% missing), so DB duration is
  unusable; the API gives authoritative length for every video.

---

## 1. Headline numbers

| Metric | Value |
|---|---|
| Video lectures in the LMS | 2,027 (of 6,400 total lecture rows; 4,373 carry no video) |
| VdoCipher vs YouTube | 1,999 vs 28 lectures (98.6% vs 1.4%) |
| VdoCipher videos referenced by the LMS (distinct) | 1,964 |
| Referenced and playable ("ready") | 1,950 |
| Migration storage (referenced) | ~2.04 TiB (2,037 GiB) |
| Migration content time (referenced) | ~1,585 hours (66 days of video) |
| Median source bitrate (referenced) | 2.03 Mbps (49% of videos are under 2 Mbps) |
| Tenants with video | 36 |
| Storage concentration | top 3 tenants = 89.9%, top 5 = 96.9% |
| **VdoCipher account total** | **8,797 videos** |
| Account "ready" videos | 4,230 (3,500 hours total) |
| **Orphaned (in account, not referenced by LMS)** | **6,846 (77.8%)** |

---

## 2. YouTube vs VdoCipher

VdoCipher is effectively the only migration target. YouTube is used by 28
lectures across 17 tenants (max 5 at MMH Academy); these are external embeds
that YouTube continues to host, so they need no migration. Of the 6,400 lecture
rows, only 2,027 are video-backed; the other 4,373 are non-video lessons or
empty shells.

| Provider | Lectures | With video key | Tenants | Courses |
|---|---|---|---|---|
| VDOCIPHER | 1,999 | 1,999 | 39 | 135 |
| YOUTUBE | 28 | 28 | 17 | 26 |
| none/unset | 4,373 | 0 | 114 | 221 |

---

## 3. Migration scope: the referenced catalog (1,950 ready videos)

### 3.1 Size (from DB, near-complete; size_bytes > 0, n = 1,951)

| Stat | Value |
|---|---|
| Total | 2,037 GiB (~2.04 TiB) |
| Mean | 1,069 MB |
| Std dev | 1,425 MB (heavy right skew) |
| Min / Max | 36 kB / 12 GB |
| p25 / p50 / p75 | 304 MB / 609 MB / 1,055 MB |
| p90 / p95 / p99 | 2,718 MB / 4,511 MB / 6,869 MB |

Mean (1,069 MB) sits well above the median (609 MB): a small number of very
large files dominate. Size distribution and, more importantly, where the bytes
actually live:

| Bucket | Videos | % of count | Storage | % of storage |
|---|---|---|---|---|
| < 50 MB | 125 | 6.4% | 3.1 GB | 0.2% |
| 50-100 MB | 53 | 2.7% | 3.8 GB | 0.2% |
| 100-250 MB | 197 | 10.1% | 35 GB | 1.7% |
| 250-500 MB | 479 | 24.6% | 177 GB | 8.7% |
| 500 MB-1 GB | 584 | 29.9% | 436 GB | 21.4% |
| 1-2 GB | 260 | 13.3% | 342 GB | 16.8% |
| 2-5 GB | 172 | 8.8% | 540 GB | 26.5% |
| > 5 GB | 81 | 4.2% | 500 GB | 24.5% |

Videos larger than 2 GB are only 13% of the count but 51% of the storage. The
81 videos over 5 GB alone are 24.5% of all bytes. These are long, high-bitrate
screen recordings (the top 10 largest are all "Frontend Engineering" at Bala
Labs, 8-12 GB each). Plan capacity and parallelism around this fat tail, not
around the median.

### 3.2 Duration (from VdoCipher API, authoritative; n = 1,950)

| Stat | Value |
|---|---|
| Total | 1,585 hours (66 days) |
| Mean | 0:48:45 |
| Median | 0:52:37 |
| p90 / p95 / p99 | 1:24 / 1:43 / 2:05 |
| Max | 3:17:00 |

| Length bucket | Videos | % | Hours |
|---|---|---|---|
| < 5 min | 195 | 10.0% | 8.9 |
| 5-15 min | 211 | 10.8% | 30.9 |
| 15-30 min | 99 | 5.1% | 38.1 |
| 30-60 min | 833 | 42.7% | 685.4 |
| 1-2 hr | 579 | 29.7% | 747.8 |
| > 2 hr | 33 | 1.7% | 73.6 |

The catalog is dominated by 30-minute to 2-hour lectures (72% of videos, 90% of
the hours). This is full-length-lecture content, not short clips.

### 3.3 Source bitrate (size x 8 / duration, authoritative; n = 1,950) — most important for the encoder

| Stat | Mbps |
|---|---|
| Median | 2.03 |
| Mean | 4.26 |
| p75 | 5.47 |
| p90 | 9.22 |
| p95 | 17.93 |
| p99 | 27.53 |
| Max | 83.0 |

| Source-bitrate band | Videos | % |
|---|---|---|
| < 2 Mbps | 955 | 49.0% |
| 2-4 | 430 | 22.1% |
| 4-6 | 130 | 6.7% |
| 6-10 | 276 | 14.2% |
| 10-15 | 22 | 1.1% |
| 15-25 | 113 | 5.8% |
| > 25 Mbps | 24 | 1.2% |

Half the catalog is under 2 Mbps (compressed talking-head, slides, makeup and
art tutorials). A thin but heavy tail of screen recordings runs 18 to 83 Mbps.
Two design consequences:

1. **Cap encoding to source.** Never encode a rendition above the source
   bitrate. For the 49% of videos under 2 Mbps, the top rungs of a fixed ladder
   would be pure waste.
2. **The ladder must still reach high.** The p95 is ~18 Mbps and 24 videos
   exceed 25 Mbps with fine on-screen text (code). A 1080p rung alone will blur
   that text; a 1440p (or capped high-bitrate 1080p) rung keeps code legible.

Suggested CMAF ladder, per-title capped: 360p ~0.5-0.7M, 480p ~1.0M,
720p ~2.0M, 1080p ~4.5M (allow up to ~8M for high-complexity sources), plus an
optional 1440p rung only for the >25 Mbps code-screencast minority.

---

## 4. Per-tenant breakdown (migration sequencing)

36 tenants have video. Storage is extremely concentrated: onboarding the top 3
tenants migrates ~90% of the bytes.

| Tenant | Videos | Storage | Avg size | % of storage |
|---|---|---|---|---|
| Skilldunia | 1,336 | 1,152 GB | 883 MB | 56.6% |
| Brush N Palette Academy | 114 | 425 GB | 3,816 MB | 20.9% |
| Bala Labs | 63 | 254 GB | 4,132 MB | 12.5% |
| Jeevitha AI Academy | 279 | 82 GB | 303 MB | 4.0% |
| Swati Art Courses | 12 | 61 GB | 5,187 MB | 3.0% |
| Qultima Academy | 5 | 20 GB | 4,134 MB | 1.0% |
| (30 more tenants) | | | | < 1% total |

Top 3 = 89.9% of storage, top 5 = 96.9%. Average size varies 18x across tenants
(Skilldunia 883 MB vs Swati Art 5,187 MB): art/makeup/coding tenants upload long
high-resolution video; quiz/skill tenants upload shorter compressed video. This
argues for per-title encoding and per-tenant storage entitlements rather than a
single platform-wide assumption.

---

## 5. Upload trend (ingest throughput requirement)

VdoCipher uploads by month (DB `tenant_video_storage.created_at`):

| Month | Videos | GiB added |
|---|---|---|
| 2026-03 | 11 | 5.6 |
| 2026-04 | 146 | 418.3 |
| 2026-05 | 1,416 | 1,087.5 |
| 2026-06 | 383 | 525.2 |

Ingest is bursty. May 2026 alone added 1,416 videos and ~1.1 TiB. The in-house
pipeline must absorb burst bulk-uploads (hundreds of videos and ~1 TiB in days),
not a smooth daily trickle. Size the Postgres-as-queue + Spot worker autoscaling
for the burst, not the average.

---

## 6. The cost finding: 77.8% of the VdoCipher account is orphaned

The account holds 8,797 videos; only 1,964 are referenced by the new LMS.

| Status (whole account) | Count |
|---|---|
| ready (playable) | 4,230 |
| PRE-Upload (abandoned, never completed) | 4,551 |
| No Content / error | 16 |

- **4,551 PRE-Upload reservations (51.7%)**: upload was initiated (a video ID
  was reserved) but the file was never uploaded. These are abandoned bulk-upload
  attempts. They carry little to no storage but clutter the account and inflate
  every list operation.
- **2,280 "ready" orphans**: fully encoded, playable, but referenced by nothing
  in the LMS. Estimated ~2.4 TiB and ~1,915 hours of content (storage estimated
  from the referenced bytes-per-second rate, since the list API does not return
  per-video size). Their upload dates span Dec 2024 through 2026, while the new
  platform only starts referencing videos in March 2026. They are therefore
  almost entirely **legacy-platform videos** (the old euron-codebases stack)
  sharing the same VdoCipher account.

Total ready content in the account is ~3,500 hours (~4.4 TiB). The new platform
owns ~1,585 hours (~2.04 TiB); the rest is legacy/orphan.

Action items this surfaces:
1. Decide ownership of the 2,280 ready orphans (legacy). Migrate them too, or
   let them retire with VdoCipher. This roughly doubles the migration if "yes".
2. The 4,551 PRE-Upload rows are safe to ignore for migration and are candidates
   for cleanup on the VdoCipher side (developer action, not via this analysis).

---

## 7. Data-quality issues found

- **DB duration is 93.5% empty.** Only 125 of 1,999 VdoCipher lectures had a
  parseable `duration`; the backfill/sweep has not populated the rest. The API
  is the source of truth here. (If you want durations in our DB for the new
  pipeline, the existing "Sync video durations" backfill can fill them.)
- **`lectures.processing_status` is dead data.** All 1,999 VdoCipher lectures sit
  at the `PROCESSING` default; nothing ever flips it to PROCESSED. Do not rely on
  it. The new pipeline should own a real status lifecycle.
- **~13 dead/invalid references.** Of the 1,964 referenced IDs, ~8 return 404 on
  VdoCipher (deleted upstream, broken playback today) and ~5 are data-entry
  errors where a YouTube ID/URL or junk text was stored in a VDOCIPHER lecture's
  `video_key` (e.g. `https://youtu.be/...`, `iJ1fXeDSKXY`, the literal string
  "Introduction, Tools and Techniques"). Worth a targeted cleanup.
- **Content duplicated across courses.** 1,999 lectures map to 1,961 distinct
  video keys; the same source video is re-referenced across multiple courses
  (e.g. one saree-draping video appears in 3 courses at 7,318 MB each). Dedup at
  the storage layer (one encoded asset, many references) would save real bytes.

---

## 8. Summary for the in-house pipeline

- **Migrate ~1,950 ready videos, ~2.04 TiB, ~1,585 source-hours** for the current
  platform. Sequence by tenant: Skilldunia, Brush N Palette, Bala Labs cover ~90%.
- **Encode with per-title / capped ABR.** Median source is only 2 Mbps and half
  the catalog is under 2 Mbps, so capping to source is the main cost lever; but
  keep a high rung (1440p / capped-1080p) for the ~24 code-screencast videos
  above 25 Mbps.
- **Size for bursts.** Ingest arrives in bulk-upload spikes (1,400 videos / 1 TiB
  in a month).
- **Plan the backfill encode budget around source-hours.** ~1,585 hours of source
  times your rendition count, divided by per-worker realtime factor and worker
  count, gives the one-time backfill window.
- **Resolve the legacy orphans** (2,280 ready, ~2.4 TiB) as a separate ownership
  decision before assuming the migration is only 2 TiB.
