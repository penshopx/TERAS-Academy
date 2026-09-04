import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(directory, "check-duplicate-schemas.mjs");

test("accepts unique schema names across active schema blocks", async () => {
  const fixture = path.join(directory, "fixtures", "clean-schemas.yaml");
  const { stdout } = await execFileAsync(process.execPath, [checker, fixture]);

  assert.match(stdout, /No duplicate schema declarations found/u);
});

test("rejects a schema repeated across separate active schema blocks", async () => {
  const fixture = path.join(directory, "fixtures", "duplicate-schemas.yaml");

  await assert.rejects(
    execFileAsync(process.execPath, [checker, fixture]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /"JourneyStep"/u);
      assert.match(error.stderr, /line 12 \(first declared on line 8\)/u);
      return true;
    },
  );
});