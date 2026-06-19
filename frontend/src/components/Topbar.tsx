import { useLocation } from "react-router-dom";
import { ConnectionStatus } from "./ConnectionStatus";

const TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === "/", title: "Videos" },
  { match: (p) => p.startsWith("/upload"), title: "Upload" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
  { match: (p) => p.startsWith("/videos/"), title: "Video" },
];

export function Topbar() {
  const { pathname } = useLocation();
  const title = TITLES.find((t) => t.match(pathname))?.title ?? "Euron Systems VOD";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-subtle px-6">
      <h1 className="text-base font-semibold text-gray-100">{title}</h1>
      <ConnectionStatus />
    </header>
  );
}
