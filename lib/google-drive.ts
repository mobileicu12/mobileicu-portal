/**
 * Minimal Google Drive uploader for the nightly backup.
 *
 * Auth is a long-lived OAuth refresh token for the owner's own Google account,
 * exchanged for a short access token per run. The `drive.file` scope means the
 * app can only ever see and manage files it created itself — never the rest of
 * the owner's Drive — so backups live in their own app-created folder.
 *
 * Credentials come from GOOGLE_DRIVE_CLIENT_ID / _SECRET (falling back to the
 * login OAuth client AUTH_GOOGLE_ID / _SECRET) plus GOOGLE_DRIVE_REFRESH_TOKEN.
 * Everything is plain HTTPS/REST, so it works anywhere fetch does.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";

const clientId = () => process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "";
const clientSecret = () =>
  process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "";
const refreshToken = () => process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "";

export function driveConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && refreshToken());
}

async function accessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // Surface Google's own reason so the fix is obvious:
    //  • invalid_grant  → refresh token is wrong/expired/revoked, OR was minted
    //    with a different OAuth client than GOOGLE_DRIVE_CLIENT_ID/SECRET.
    //  • invalid_client → client id/secret don't match the one that minted it.
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    const reason = [body.error, body.error_description].filter(Boolean).join(": ");
    const hint = body.error === "invalid_grant"
      ? " The refresh token is invalid/expired, or was created with a different Google OAuth client than the one the app uses. Re-generate it with the SAME client id/secret set in Vercel."
      : body.error === "invalid_client"
        ? " The GOOGLE_DRIVE_CLIENT_ID / _SECRET don't match the client that created the refresh token."
        : "";
    throw new Error(`Google token exchange failed (${res.status})${reason ? ` — ${reason}` : ""}.${hint}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google did not return an access token.");
  return data.access_token;
}

async function findOrCreateFolder(token: string, name: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${safe}' and trashed=false`,
  );
  const list = await fetch(`${FILES_URL}?q=${q}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (list.ok) {
    const data = (await list.json()) as { files?: { id: string }[] };
    if (data.files?.length) return data.files[0].id;
  }
  const create = await fetch(FILES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!create.ok) throw new Error(`Could not create the Drive folder (${create.status}).`);
  const created = (await create.json()) as { id: string };
  return created.id;
}

/** Keep only the newest `keep` files in the folder; trash the rest. */
async function pruneOld(token: string, folderId: string, keep: number): Promise<void> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const list = await fetch(
    `${FILES_URL}?q=${q}&orderBy=createdTime desc&fields=files(id,createdTime)&pageSize=200`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!list.ok) return;
  const data = (await list.json()) as { files?: { id: string }[] };
  for (const f of (data.files ?? []).slice(keep)) {
    await fetch(`${FILES_URL}/${f.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

export type DriveUploadResult = { id: string; name: string; link: string | null };

/** Upload one text file into a named, app-owned folder, then prune old ones. */
export async function uploadTextToDrive(opts: {
  folderName: string;
  filename: string;
  content: string;
  mimeType?: string;
  keep?: number;
}): Promise<DriveUploadResult> {
  const token = await accessToken();
  const folderId = await findOrCreateFolder(token, opts.folderName);

  const meta = { name: opts.filename, parents: [folderId] };
  const boundary = `micu-${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${opts.mimeType ?? "application/json"}\r\n\r\n` +
    `${opts.content}\r\n` +
    `--${boundary}--`;

  const up = await fetch(`${UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!up.ok) throw new Error(`Drive upload failed (${up.status}).`);
  const file = (await up.json()) as { id: string; name: string; webViewLink?: string };

  if (opts.keep && opts.keep > 0) await pruneOld(token, folderId, opts.keep);

  return { id: file.id, name: file.name, link: file.webViewLink ?? null };
}
