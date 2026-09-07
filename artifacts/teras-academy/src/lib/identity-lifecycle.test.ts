import assert from "node:assert/strict";
import test from "node:test";
import { hasIdentityChanged, type PreviousUserId, type UserId } from "./identity-lifecycle";

function applyIdentityEvents(events: UserId[]) {
  let previousUserId: PreviousUserId;
  let cacheClearCount = 0;
  let subtreeRevision = 0;

  for (const userId of events) {
    if (hasIdentityChanged(previousUserId, userId)) {
      cacheClearCount += 1;
      subtreeRevision += 1;
    }
    previousUserId = userId;
  }

  return { cacheClearCount, subtreeRevision };
}

test("repeated Supabase token refreshes for the same user preserve cache and subtree state", () => {
  assert.deepEqual(applyIdentityEvents(["user-a", "user-a", "user-a"]), {
    cacheClearCount: 0,
    subtreeRevision: 0,
  });
});

test("a Supabase auth subject change clears cache and remounts the subtree", () => {
  assert.deepEqual(applyIdentityEvents(["user-a", "user-b"]), {
    cacheClearCount: 1,
    subtreeRevision: 1,
  });
});

test("sign-out and subsequent sign-in are identity changes", () => {
  assert.deepEqual(applyIdentityEvents(["user-a", null, "user-b"]), {
    cacheClearCount: 2,
    subtreeRevision: 2,
  });
});