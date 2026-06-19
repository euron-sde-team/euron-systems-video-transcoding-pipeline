import { useCallback, useRef, useState } from "react";
import { completeUpload, createUpload } from "../../api/videos";
import { useInvalidateVideos } from "../../hooks/useMutations";
import { ApiError } from "../../lib/apiClient";
import { ALLOWED_UPLOAD_EXTS, UPLOAD_CONCURRENCY } from "../../lib/constants";

export type UploadStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "completing"
  | "done"
  | "error"
  | "cancelled";

export interface UploadItem {
  clientId: string;
  name: string;
  size: number;
  status: UploadStatus;
  progress: number; // 0..100 (S3 transfer)
  videoId?: string;
  error?: string;
}

const ACTIVE: UploadStatus[] = ["creating", "uploading", "completing"];

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `u_${counter}_${Math.floor(performance.now())}`;
}

/**
 * Drives the 3-step upload per file: create presigned -> XHR PUT to S3 (with
 * progress) -> complete. Runs up to UPLOAD_CONCURRENCY in parallel; the rest wait.
 * File objects live in a ref map and are dropped the moment a file finishes
 * (memory: never hold large File blobs longer than the transfer).
 */
export function useUploadManager() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const xhrRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const invalidateVideos = useInvalidateVideos();

  const commit = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (clientId: string, p: Partial<UploadItem>) => {
      commit(itemsRef.current.map((it) => (it.clientId === clientId ? { ...it, ...p } : it)));
    },
    [commit]
  );

  const releaseFile = useCallback((clientId: string) => {
    filesRef.current.delete(clientId);
    xhrRef.current.delete(clientId);
  }, []);

  // Resolves when the S3 transfer finishes; rejects on HTTP/network error or abort.
  const putToStorage = useCallback(
    (clientId: string, url: string, fields: Record<string, string>, file: File) =>
      new Promise<void>((resolve, reject) => {
        const form = new FormData();
        // S3/MinIO presigned POST requires the policy fields BEFORE the file field.
        Object.entries(fields).forEach(([k, v]) => form.append(k, v));
        form.append("file", file);

        const xhr = new XMLHttpRequest();
        xhrRef.current.set(clientId, xhr);
        xhr.open("POST", url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            patch(clientId, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage rejected the upload (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("__aborted__"));
        xhr.send(form);
      }),
    [patch]
  );

  const process = useCallback(
    async (item: UploadItem) => {
      const file = filesRef.current.get(item.clientId);
      if (!file) return;
      try {
        patch(item.clientId, { status: "creating" });
        const { videoId, upload } = await createUpload(file.name, file.name);
        patch(item.clientId, { status: "uploading", videoId, progress: 0 });

        await putToStorage(item.clientId, upload.url, upload.fields, file);

        patch(item.clientId, { status: "completing", progress: 100 });
        await completeUpload(videoId);

        patch(item.clientId, { status: "done" });
        invalidateVideos();
      } catch (err) {
        if ((err as Error)?.message === "__aborted__") {
          patch(item.clientId, { status: "cancelled" });
        } else {
          const msg =
            err instanceof ApiError
              ? err.status === 429
                ? "Upload cap reached. Finish or cancel some videos and retry."
                : err.message
              : (err as Error)?.message || "Upload failed";
          patch(item.clientId, { status: "error", error: msg });
        }
      } finally {
        releaseFile(item.clientId);
      }
    },
    [patch, putToStorage, invalidateVideos, releaseFile]
  );

  // Start queued items until the concurrency window is full; re-runs as slots free.
  const pump = useCallback(() => {
    const active = itemsRef.current.filter((it) => ACTIVE.includes(it.status)).length;
    let slots = UPLOAD_CONCURRENCY - active;
    if (slots <= 0) return;
    for (const it of itemsRef.current) {
      if (slots <= 0) break;
      if (it.status === "queued") {
        slots -= 1;
        // Fire-and-forget; each settle triggers another pump.
        void process(it).then(pump);
      }
    }
  }, [process]);

  const addFiles = useCallback(
    (files: File[]): { rejected: string[] } => {
      const rejected: string[] = [];
      const accepted: UploadItem[] = [];
      for (const file of files) {
        if (!ALLOWED_UPLOAD_EXTS.includes(extOf(file.name) as (typeof ALLOWED_UPLOAD_EXTS)[number])) {
          rejected.push(file.name);
          continue;
        }
        const clientId = nextId();
        filesRef.current.set(clientId, file);
        accepted.push({
          clientId,
          name: file.name,
          size: file.size,
          status: "queued",
          progress: 0,
        });
      }
      if (accepted.length) {
        commit([...itemsRef.current, ...accepted]);
        pump();
      }
      return { rejected };
    },
    [commit, pump]
  );

  const cancelItem = useCallback(
    (clientId: string) => {
      const xhr = xhrRef.current.get(clientId);
      if (xhr) {
        xhr.abort();
        return;
      }
      // Not yet started: drop it from the queue.
      const it = itemsRef.current.find((i) => i.clientId === clientId);
      if (it && it.status === "queued") {
        releaseFile(clientId);
        patch(clientId, { status: "cancelled" });
      }
    },
    [patch, releaseFile]
  );

  const clearFinished = useCallback(() => {
    commit(
      itemsRef.current.filter(
        (it) => !["done", "error", "cancelled"].includes(it.status)
      )
    );
  }, [commit]);

  return { items, addFiles, cancelItem, clearFinished };
}
