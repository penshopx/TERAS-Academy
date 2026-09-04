type StoredIdempotency = {
  fingerprint: string;
  key: string;
};

const STORAGE_PREFIX = "teras:draft-idempotency:v1";

function hash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function storageKey(flow: string) {
  return `${STORAGE_PREFIX}:${hash(flow)}`;
}

function read(storage: Storage, flow: string): StoredIdempotency | null {
  try {
    const value = JSON.parse(storage.getItem(storageKey(flow)) ?? "null");
    return typeof value?.fingerprint === "string" && typeof value?.key === "string" ? value : null;
  } catch {
    return null;
  }
}

export function getDraftIdempotencyKey(storage: Storage, flow: string, payload: string) {
  const fingerprint = hash(payload);
  const existing = read(storage, flow);

  if (existing?.fingerprint === fingerprint) {
    return existing.key;
  }

  const key = crypto.randomUUID();
  try {
    storage.setItem(storageKey(flow), JSON.stringify({ fingerprint, key }));
  } catch {
    // The in-flight request can still proceed when browser storage is unavailable.
  }
  return key;
}

export function clearDraftIdempotencyKey(storage: Storage, flow: string) {
  try {
    storage.removeItem(storageKey(flow));
  } catch {
    // A confirmed response must not be turned into an error by unavailable storage.
  }
}