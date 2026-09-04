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

test("allows an http resource URI and tracks its opening", () => {
  const calls: string[] = [];
  setTestWindow({
    track(name) {
      calls.push(name);
    },
  });
  const httpResource = {
    ...resource,
    uri: "http://example.com/materials/isolation.pdf",
  };

  const link = LearningResourceLink({ activityId: "activity-4", resource: httpResource });
  link.props.onClick();

  assert.equal(link.type, "a");
  assert.equal(link.props.href, httpResource.uri);
  assert.deepStrictEqual(calls, ["learning_resource_opened"]);
});

test("renders a clear non-interactive status when the resource URI is missing", () => {
  const unavailableResource = {
    ...resource,
    uri: null,
  };

  const status = LearningResourceLink({
    activityId: "activity-4",
    resource: unavailableResource,
  });
  const markup = renderToStaticMarkup(status);

  assert.equal(status.type, "div");
  assert.equal(status.props.href, undefined);
  assert.equal(status.props.target, undefined);
  assert.doesNotMatch(markup, /<a\b/);
  assert.match(markup, /Material not available yet/);
});

test("treats a blank resource URI as unavailable", () => {
  const status = LearningResourceLink({
    activityId: "activity-4",
    resource: {
      ...resource,
      uri: "   ",
    },
  });

  assert.equal(status.type, "div");
  assert.doesNotMatch(renderToStaticMarkup(status), /href=/);
});

test("renders unsafe resource URI schemes as unavailable without analytics", () => {
  const calls: string[] = [];
  setTestWindow({
    track(name) {
      calls.push(name);
    },
  });

  for (const uri of [
    "javascript:alert(document.domain)",
    "data:text/html,<script>alert(document.domain)</script>",
  ]) {
    const status = LearningResourceLink({
      activityId: "activity-4",
      resource: { ...resource, uri },
    });
    const markup = renderToStaticMarkup(status);

    assert.equal(status.type, "div");
    assert.equal(status.props.onClick, undefined);
    assert.doesNotMatch(markup, /<a\b/);
    assert.doesNotMatch(markup, /href=/);
    assert.match(markup, /Material not available yet/);
  }

  assert.deepStrictEqual(calls, []);
});

test("renders relative and malformed resource URIs as unavailable", () => {
  for (const uri of ["/materials/isolation.pdf", "not a URL"]) {
    const status = LearningResourceLink({
      activityId: "activity-4",
      resource: { ...resource, uri },
    });

    assert.equal(status.type, "div");
    assert.doesNotMatch(renderToStaticMarkup(status), /href=/);
  }
});
test("uses managed storage objectPath to construct secure URL", () => {
  const managedResource = {
    ...resource,
    uri: null,
    objectPath: "/objects/managed-file.pdf",
    mimeType: "application/pdf"
  };

  const link = LearningResourceLink({ activityId: "activity-4", resource: managedResource });

  assert.equal(link.type, "a");
  assert.equal(link.props.href, "/api/storage/objects/managed-file.pdf");
});

test("prevents duplicate /objects path segments", () => {
  // if objectPath already starts with /objects/, just prepend /api/storage
  // verify we don't accidentally do /api/storage/objects/objects/
  const managedResource = {
    ...resource,
    uri: null,
    objectPath: "/objects/some-file.pdf"
  };
  const link = LearningResourceLink({ activityId: "activity-4", resource: managedResource });
  assert.equal(link.props.href, "/api/storage/objects/some-file.pdf");
});

test("renders TEXT type inline accessibly without generating a link", () => {
  const textResource = {
    ...resource,
    type: "TEXT",
    content: "Here is some raw content",
    uri: null,
    objectPath: null
  };

  const status = LearningResourceLink({ activityId: "activity-4", resource: textResource });
  const markup = renderToStaticMarkup(status);

  assert.equal(status.type, "div");
  assert.doesNotMatch(markup, /<a\b/);
  assert.match(markup, /Here is some raw content/);
  assert.match(markup, /data-testid="activity-resource-text-resource-5"/);
});
