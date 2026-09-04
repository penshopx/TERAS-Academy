import assert from "node:assert/strict";
import test from "node:test";
import { clearDraftIdempotencyKey, getDraftIdempotencyKey } from "./draft-idempotency";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("reuses a key after a reload and re-entry of the same draft without storing its content", () => {
  const storage = new MemoryStorage();
  const firstPagePayload = JSON.stringify({
    taskId: "task-1",
    reflection: "sensitive reflection",
    outputSummary: "private output",
    sourceActivityId: "activity-1",
  });

  const first = getDraftIdempotencyKey(storage, "practice:activity:task", firstPagePayload);

  // A remounted page reconstructs the same payload from recovered/re-entered fields.
  const reloadedPagePayload = JSON.stringify({
    taskId: "task-1",
    reflection: "sensitive reflection",
    outputSummary: "private output",
    sourceActivityId: "activity-1",
  });
  const retry = getDraftIdempotencyKey(storage, "practice:activity:task", reloadedPagePayload);

  assert.equal(retry, first);
  assert.doesNotMatch(storage.getItem(storage.key(0)!)!, /sensitive reflection/);
  assert.doesNotMatch(storage.getItem(storage.key(0)!)!, /private output/);
});

test("replaces a key when the draft changes and clears it after success", () => {
  const storage = new MemoryStorage();
  const first = getDraftIdempotencyKey(storage, "evidence:attempt", "first payload");
  const changed = getDraftIdempotencyKey(storage, "evidence:attempt", "changed payload");

  assert.notEqual(changed, first);
  clearDraftIdempotencyKey(storage, "evidence:attempt");
  assert.equal(storage.length, 0);
});