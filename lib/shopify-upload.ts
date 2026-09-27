import { adminGraphQL, ShopifyError } from "./shopify";

/**
 * Upload an image file to Shopify's staged storage and return a resourceUrl
 * that productCreateMedia / product `files` can attach to a product.
 *
 * Shopify's file-upload flow is two steps:
 *   1. stagedUploadsCreate → a one-time upload target (url + form params) plus
 *      the resourceUrl the media will live at.
 *   2. POST the bytes to that target (multipart; the params must come BEFORE the
 *      file field, and `file` must be last — Google Cloud Storage requires it).
 * The resourceUrl is then used as the media's originalSource.
 */

const STAGED_UPLOADS_CREATE = /* GraphQL */ `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
};

export async function stagedUploadImage(
  filename: string,
  mimeType: string,
  body: Buffer,
): Promise<string> {
  const data = await adminGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: StagedTarget[];
      userErrors: { message: string }[];
    };
  }>(STAGED_UPLOADS_CREATE, {
    input: [
      {
        filename,
        mimeType,
        httpMethod: "POST",
        resource: "IMAGE",
        fileSize: String(body.length),
      },
    ],
  });

  const errs = data.stagedUploadsCreate.userErrors;
  if (errs?.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));

  const target = data.stagedUploadsCreate.stagedTargets[0];
  if (!target?.url) throw new ShopifyError("Shopify returned no upload target.");

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(body)], { type: mimeType }), filename);

  const up = await fetch(target.url, { method: "POST", body: form });
  if (!up.ok) {
    const detail = await up.text().catch(() => "");
    throw new ShopifyError(`Image upload to Shopify failed (${up.status}). ${detail.slice(0, 200)}`);
  }

  return target.resourceUrl;
}
