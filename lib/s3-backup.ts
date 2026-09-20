import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Off-site backup to Cloudflare R2 (or any S3-compatible bucket).
 *
 * Unlike the old Google Drive path, this authenticates with a STATIC access key
 * + secret that never expire — set them once and the nightly backup keeps
 * working forever, with nothing to re-authorise. Everything is plain HTTPS with
 * an AWS Signature V4 signer built on node:crypto, so there's no SDK to install
 * and it runs anywhere `fetch` does.
 *
 * Configure with four environment variables (all one-time):
 *   R2_ACCOUNT_ID          your Cloudflare account id (32 hex chars)
 *   R2_ACCESS_KEY_ID       an R2 API token's Access Key ID
 *   R2_SECRET_ACCESS_KEY   the matching Secret Access Key
 *   R2_BUCKET              the bucket name to store backups in
 * Optionally R2_ENDPOINT to point at a non-R2 S3 endpoint (e.g. Backblaze B2).
 */

const REGION = "auto"; // R2 ignores region but SigV4 requires one; "auto" is R2's.
const SERVICE = "s3";

function env(name: string): string {
  return process.env[name] ?? "";
}

export function r2Configured(): boolean {
  return Boolean(
    env("R2_ACCESS_KEY_ID") &&
      env("R2_SECRET_ACCESS_KEY") &&
      env("R2_BUCKET") &&
      (env("R2_ACCOUNT_ID") || env("R2_ENDPOINT")),
  );
}

/** Base endpoint, e.g. https://<account>.r2.cloudflarestorage.com (no bucket). */
function endpoint(): { host: string; origin: string } {
  const explicit = env("R2_ENDPOINT").trim();
  const url = explicit
    ? explicit.replace(/\/+$/, "")
    : `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  return { host: new URL(url).host, origin: url };
}

/** RFC 3986 encoding as AWS SigV4 requires (encode everything but unreserved). */
function uriEncode(str: string, encodeSlash = true): string {
  let out = "";
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const b of Buffer.from(ch, "utf8")) {
        out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

const sha256hex = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

type S3Req = {
  method: "GET" | "PUT" | "DELETE";
  key: string; // object key (may be empty for a bucket-level list)
  query?: Record<string, string>;
  body?: Buffer;
  contentType?: string;
};

/** Sign and send one S3 request with SigV4 and a signed payload hash. */
async function s3Fetch(req: S3Req): Promise<Response> {
  const { host, origin } = endpoint();
  const bucket = env("R2_BUCKET");
  const accessKey = env("R2_ACCESS_KEY_ID");
  const secretKey = env("R2_SECRET_ACCESS_KEY");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const body = req.body ?? Buffer.alloc(0);
  const payloadHash = sha256hex(body);

  // Canonical URI: /<bucket>/<key>, each path segment encoded (slashes kept).
  const keyPath = req.key
    ? "/" + req.key.split("/").map((s) => uriEncode(s, false)).join("/")
    : "";
  const canonicalUri = "/" + uriEncode(bucket, false) + keyPath;

  // Canonical query: sorted, key- and value-encoded.
  const query = req.query ?? {};
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (req.contentType) headers["content-type"] = req.contentType;

  const signedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders =
    signedHeaderNames.map((h) => `${h}:${headers[h].trim()}`).join("\n") + "\n";
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    req.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = origin + canonicalUri + (canonicalQuery ? `?${canonicalQuery}` : "");
  return fetch(url, {
    method: req.method,
    headers: { ...headers, Authorization: authorization },
    // Blob is a BodyInit the DOM types accept; undici sends the raw bytes.
    body: req.method === "PUT" ? new Blob([new Uint8Array(body)]) : undefined,
  });
}

export type R2UploadResult = { key: string; bucket: string };

/** List object keys under a prefix (newest first), for pruning. */
async function listKeys(prefix: string): Promise<{ key: string; lastModified: string }[]> {
  const res = await s3Fetch({ method: "GET", key: "", query: { "list-type": "2", prefix } });
  if (!res.ok) return [];
  const xml = await res.text();
  const out: { key: string; lastModified: string }[] = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1];
    const lastModified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(m[1])?.[1] ?? "";
    if (key) out.push({ key, lastModified });
  }
  out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  return out;
}

/** Upload one text object, then prune the prefix to the newest `keep` files. */
export async function uploadTextToR2(opts: {
  key: string; // full object key including any prefix, e.g. "backups/dudao-2026-08-29.json"
  content: string;
  contentType?: string;
  keep?: number;
  prunePrefix?: string; // prefix to prune (defaults to the key's folder)
}): Promise<R2UploadResult> {
  const bucket = env("R2_BUCKET");
  const put = await s3Fetch({
    method: "PUT",
    key: opts.key,
    body: Buffer.from(opts.content, "utf8"),
    contentType: opts.contentType ?? "application/json",
  });
  if (!put.ok) {
    const detail = await put.text().catch(() => "");
    throw new Error(
      `R2 upload failed (${put.status}). Check the bucket name and API token.` +
        (detail ? ` ${detail.slice(0, 200)}` : ""),
    );
  }

  if (opts.keep && opts.keep > 0) {
    const prefix = opts.prunePrefix ?? opts.key.replace(/[^/]+$/, "");
    try {
      const keys = await listKeys(prefix);
      for (const old of keys.slice(opts.keep)) {
        await s3Fetch({ method: "DELETE", key: old.key }).catch(() => {});
      }
    } catch {
      // Pruning is best-effort; a full bucket is better than a failed backup.
    }
  }

  return { key: opts.key, bucket };
}
