/* eslint-disable react-refresh/only-export-components -- router module exports the router config alongside a small fallback. */
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { NotFound } from "../components/NotFound";
import { SettingsPage } from "../features/settings/SettingsPage";
import { UploadPage } from "../features/upload/UploadPage";
import { VideosPage } from "../features/videos/VideosPage";

// shaka-player is large and only needed for playback, so the detail page (and
// the whole player tree it pulls in) loads on demand, keeping the dashboard light.
const VideoDetailPage = lazy(() =>
  import("../features/player/VideoDetailPage").then((m) => ({ default: m.VideoDetailPage }))
);

function RouteFallback() {
  return (
    <div className="flex justify-center px-6 py-24">
      <Loader2 className="h-7 w-7 animate-spin text-gray-600" />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <VideosPage /> },
      { path: "/upload", element: <UploadPage /> },
      {
        path: "/videos/:id",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <VideoDetailPage />
          </Suspense>
        ),
      },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
