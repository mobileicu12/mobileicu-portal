// Pull a generated file (Excel, PDF, CSV) down from an API route.
//
// The obvious `window.location.href = "/api/…/export"` navigates the whole tab
// at the endpoint. When it returns a file the browser downloads it and stays
// put, but when it returns an error — Shopify down, no permission, export timed
// out — the tab lands on a page of raw JSON and whatever the user was doing is
// gone. That is what "Excel doesn't work" looked like from the shop floor.
//
// Fetching it instead keeps the page where it is, lets a failure come back as a
// normal on-screen message, and gives the caller something to hang a spinner on.

/** Thrown with the server's own message when an export endpoint refuses. */
export class DownloadError extends Error {}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick — Safari needs the URL to survive the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filename the server asked for, falling back to the caller's suggestion. */
function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* fall through */ } }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : fallback;
}

export async function downloadFile(url: string, fallbackName = "download"): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    // Export routes answer with { error } on failure; fall back to the status.
    const msg = await res
      .clone()
      .json()
      .then((d: { error?: string }) => d?.error)
      .catch(() => null);
    throw new DownloadError(msg || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new DownloadError("The export came back empty.");
  const name = filenameFrom(res, fallbackName);
  saveBlob(blob, name);
  return name;
}
