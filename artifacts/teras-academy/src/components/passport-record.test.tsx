import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PassportRecord } from "./passport-record";

const timeline = Array.from({ length: 12 }, (_, index) => ({
  id: `step-${index}`,
  pathwayId: index % 2 === 0 ? "path-a" : "path-b",
  pathwayName: index % 2 === 0 ? "Path A" : "Path B",
  label: `Edited field activity ${index + 1}`,
  description: `Longitudinal practice and evaluation record ${index + 1}`,
  status: index === 11 ? "" : index % 3 === 0 ? "Blocked" : "Complete",
  date: index === 10 ? null : `2026-08-${String(index + 1).padStart(2, "0")}`,
  href: null,
}));

test("keeps long Path A and Path B history explicit and complete", () => {
  const markup = renderToStaticMarkup(<PassportRecord timeline={timeline} achievements={[]} />);

  assert.equal((markup.match(/data-testid="timeline-record-/g) ?? []).length, 12);
  assert.match(markup, /Path A/);
  assert.match(markup, /Path B/);
  assert.match(markup, /Date not recorded/);
  assert.match(markup, /Status not recorded/);
  assert.match(markup, /lg:grid-cols-12/);
  assert.match(markup, /break-words/);
});

test("uses structured pathway identity when activity copy changes", () => {
  const markup = renderToStaticMarkup(
    <PassportRecord
      timeline={[
        { ...timeline[0], label: "Renamed activity", description: "Copy without a pathway label" },
        { ...timeline[1], pathwayId: null, pathwayName: null, label: "Legacy activity", description: "Archived copy" },
      ]}
      achievements={[]}
    />,
  );

  assert.match(markup, /Path A/);
  assert.match(markup, /Pathway not recorded/);
});

test("renders professional empty achievements and preserves evidence counts", () => {
  const emptyMarkup = renderToStaticMarkup(<PassportRecord timeline={[]} achievements={[]} />);
  assert.match(emptyMarkup, /No pathway activity has been recorded yet/);
  assert.match(emptyMarkup, /No verified capabilities have been recorded yet/);
  assert.match(emptyMarkup, />0 records</);

  const populatedMarkup = renderToStaticMarkup(
    <PassportRecord
      timeline={timeline.slice(0, 2)}
      achievements={[{
        id: "achievement-1",
        capability: "Electrical safety",
        level: "Verified",
        program: "Solar PV Technician",
        pathway: "Path B",
        achievedAt: null,
        evidenceCount: 7,
        status: "",
      }]}
    />,
  );
  assert.match(populatedMarkup, /Path B/);
  assert.match(populatedMarkup, /7 verified/);
  assert.match(populatedMarkup, /Date not recorded/);
  assert.match(populatedMarkup, /Status not recorded/);
  assert.match(populatedMarkup, /min-\[380px\]:grid-cols-2/);
});

test("passport keeps the canonical safety panel beside the longitudinal record", async () => {
  const source = await readFile(new URL("../pages/passport.tsx", import.meta.url), "utf8");
  assert.match(source, /<LearnerCondition owner="Learner"\s*\/>/);
  assert.match(source, /<PassportRecord timeline=\{passport\.timeline\} achievements=\{passport\.achievements\}\s*\/>/);
});