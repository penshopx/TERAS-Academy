export const RESOURCE_URI_ERROR =
  "Resource URI must be an absolute URL using the http: or https: protocol";

export function validateResourceUri(uri: string | null | undefined): string | null | undefined {
  if (uri == null) return uri;

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(RESOURCE_URI_ERROR);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(RESOURCE_URI_ERROR);
  }

  return uri;
}