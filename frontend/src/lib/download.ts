/**
 * Trigger a browser file download from a (cross-origin) URL without navigating
 * away from the SPA. The presigned R2 URL carries `Content-Disposition:
 * attachment`, so the browser saves the file; the `download` attribute is a
 * best-effort filename hint (ignored cross-origin, where the header wins).
 */
export function triggerBrowserDownload(url: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
