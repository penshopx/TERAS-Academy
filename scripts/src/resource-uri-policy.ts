export type UnsafeResourceUriFinding =
  | "MALFORMED_URI"
  | "RELATIVE_URI"
  | "UNSAFE_PROTOCOL";

export function classifyUnsafeResourceUri(uri: string): UnsafeResourceUriFinding | null {
  const value = uri.trim();
  if (!value || /\s/.test(uri)) return "MALFORMED_URI";

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value.startsWith("/") || !/^[a-z][a-z\d+.-]*:/i.test(value)
      ? "RELATIVE_URI"
      : "MALFORMED_URI";
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? null
    : "UNSAFE_PROTOCOL";
}