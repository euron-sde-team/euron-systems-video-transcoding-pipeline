import { request } from "../lib/apiClient";
import type {
  CompleteUploadResponse,
  CreateUploadResponse,
  PlaybackTokenResponse,
  VideoListResponse,
  VideoResponse,
  VideoStatus,
} from "../types/api";

export interface ListVideosParams {
  page?: number;
  limit?: number;
  status?: VideoStatus | "";
}

export function listVideos(params: ListVideosParams): Promise<VideoListResponse> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return request<VideoListResponse>(`/videos${qs ? `?${qs}` : ""}`);
}

export function getVideo(id: string): Promise<VideoResponse> {
  return request<VideoResponse>(`/videos/${id}`);
}

export function createUpload(filename: string, title?: string): Promise<CreateUploadResponse> {
  return request<CreateUploadResponse>("/videos/uploads", {
    method: "POST",
    body: { filename, title },
  });
}

export function completeUpload(id: string): Promise<CompleteUploadResponse> {
  return request<CompleteUploadResponse>(`/videos/${id}/complete`, { method: "POST", body: {} });
}

export function retryVideo(id: string): Promise<VideoResponse> {
  return request<VideoResponse>(`/videos/${id}/retry`, { method: "POST", body: {} });
}

export function cancelVideo(id: string): Promise<VideoResponse> {
  return request<VideoResponse>(`/videos/${id}/cancel`, { method: "POST", body: {} });
}

export function renameVideo(id: string, title: string): Promise<VideoResponse> {
  return request<VideoResponse>(`/videos/${id}`, { method: "PATCH", body: { title } });
}

export function mintPlaybackToken(
  id: string,
  userId: string,
  ttlSeconds?: number
): Promise<PlaybackTokenResponse> {
  return request<PlaybackTokenResponse>(`/videos/${id}/playback-token`, {
    method: "POST",
    body: { userId, ttlSeconds },
  });
}
