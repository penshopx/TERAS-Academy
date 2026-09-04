import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningResourceLink } from "../pages/learning-lesson";

const resource = {
  id: "resource-5",
  title: "Isolation procedure",
  type: "PDF",
  uri: "https://example.com/materials/isolation.pdf",
};

type TestUmami = {
  track(name: string, data?: Record<string, string | number | boolean>): void;
};

function setTestWindow(umami?: TestUmami): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { umami },
  });
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("tracks an active activity resource exactly once with the minimum payload", () => {
  const calls: Array<{
    name: string;
    data?: Record<string, string | number | boolean>;
  }> = [];
  setTestWindow({
    track(name, data) {
      calls.push({ name, data });
    },
  });

  const link = LearningResourceLink({ activityId: "activity-4", resource });
  link.props.onClick();

  assert.deepStrictEqual(calls, [{
    name: "learning_resource_opened",
    data: {
      activity_id: "activity-4",
      resource_id: "resource-5",
      resource_type: "PDF",
      location: "lesson_activity_resources",
    },
  }]);
});

test("keeps the native resource URI when the tracker is unavailable", () => {
  setTestWindow();

  const link = LearningResourceLink({ activityId: "activity-4", resource });

  assert.doesNotThrow(() => link.props.onClick());
  assert.equal(link.props.href, resource.uri);
  assert.match(renderToStaticMarkup(link), new RegExp(`href="${resource.uri}"`));
});

test("keeps the native resource URI when the tracker throws", () => {
  setTestWindow({
    track() {
      throw new Error("tracker unavailable");
    },
  });

  const link = LearningResourceLink({ activityId: "activity-4", resource });

  assert.doesNotThrow(() => link.props.onClick());
  assert.equal(link.props.href, resource.uri);
});