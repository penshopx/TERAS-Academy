import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";
import {
  getListAuthoredCourseVersionsQueryKey,
  getListCourseAuthoringAuditQueryKey,
  type CourseVersion,
} from "@workspace/api-client-react";
import {
  HistoryRefreshWarning,
  HistoryRefreshStatus,
  PublishedVersionHistory,
  PublishSuccessMessage,
  publishAuthoredCourseAndRefresh,
  refreshAuthoringHistory,
} from "./trainer/authoring/validation-panel";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sources = [
  "trainer/authoring/course-authoring.tsx",
  "trainer/authoring/course-selector.tsx",
  "trainer/authoring/authoring-tree.tsx",
  "trainer/authoring/authoring-editor.tsx",
  "trainer/authoring/validation-panel.tsx",
];

test("Course authoring uses authored course endpoints, NOT learning endpoints", async () => {
  const contents = await Promise.all(
    sources.map(file => readFile(path.join(__dirname, file), "utf8"))
  );
  
  const allContent = contents.join("\n");
  
  // Must use useListAuthoredCourses, not useListLearningCourses
  assert.match(allContent, /useListAuthoredCourses/);
  assert.doesNotMatch(allContent, /useListLearningCourses/);
  
  // Must invalidate properly
  assert.match(allContent, /getListAuthoredCoursesQueryKey\(\)/);
  assert.match(allContent, /getPreviewAuthoredCourseQueryKey\(/);
  
  // Must have required fields and direct upload
  assert.match(allContent, /metadata\.practiceTaskId/);
  assert.match(allContent, /capabilityModuleId/);
  assert.match(allContent, /useRequestManagedResourceUploadUrl/);
  assert.match(allContent, /fetch\(uploadURL, \{/);
  assert.match(allContent, /method: "PUT"/);
  
  // Must have history/audit logic
  assert.match(allContent, /useListAuthoredCourseVersions/);
  assert.match(allContent, /useListCourseAuthoringAudit/);
  
  // Accessibility and test IDs
  assert.match(allContent, /data-testid="tab-history"/);
  assert.match(allContent, /data-testid="button-create-course-dialog"/);
  assert.match(allContent, /data-testid="input-course-title"/);
  assert.match(allContent, /data-testid="select-activity-type"/);
});

test("trainer desk avoids learner-only condition requests", async () => {
  const trainerCode = await readFile(path.join(__dirname, "../pages/trainer.tsx"), "utf8");
  assert.doesNotMatch(trainerCode, /LearnerCondition/);
});

test("Adding COURSE_MODULE requires canonical moduleId payload", async () => {
  const code = await readFile(path.join(__dirname, "trainer/authoring/authoring-tree.tsx"), "utf8");
  assert.match(code, /moduleId: newModuleId\.trim\(\)/);
  assert.match(code, /data-testid="input-new-module-id"/);
  assert.match(code, /DialogTitle>Add Course Module/);
  assert.match(code, /canonical Module ID from the capability pathway catalog/);
});

test("Course create dialog collects all required topological metadata", async () => {
  const code = await readFile(path.join(__dirname, "trainer/authoring/course-selector.tsx"), "utf8");
  assert.match(code, /programId: newProgramId\.trim\(\)/);
  assert.match(code, /pathwayId: newPathwayId\.trim\(\)/);
  assert.match(code, /sequence: newSequence \? Number\(newSequence\) : undefined/);
  assert.match(code, /data-testid="input-new-course-program"/);
  assert.match(code, /data-testid="input-new-course-pathway"/);
  assert.match(code, /data-testid="input-new-course-sequence"/);
  assert.match(code, /data-testid="error-course-create"/);
});

function courseVersion(overrides: Partial<CourseVersion> = {}): CourseVersion {
  return {
    id: "version-1",
    courseId: "course-1",
    version: 3,
    authoringRevision: 17,
    lifecycle: "PUBLISHED",
    publishedAt: "2026-09-04T08:30:00.000Z",
    ...overrides,
  };
}

test("publish success displays the non-zero authoring revision returned by the API", () => {
  const response = courseVersion({ authoringRevision: 17, version: 3 });
  const markup = renderToStaticMarkup(<PublishSuccessMessage version={response} />);

  assert.match(markup, /Authoring revision 17 was published as immutable version 3\./);
});

test("history refresh warning says publish succeeded and asks the trainer to reload History", () => {
  const markup = renderToStaticMarkup(<HistoryRefreshWarning />);

  assert.match(markup, /Course published, but History could not be refreshed\./);
  assert.match(markup, /Open History and try reloading it/);
  assert.match(markup, /data-testid="alert-history-refresh-failed"/);
});

test("manual History refresh refetches both version and audit queries", async () => {
  const courseId = "course-1";
  const refetchedKeys: QueryKey[] = [];

  const result = await refreshAuthoringHistory({
    courseId,
    refetchQueries: async queryKey => {
      refetchedKeys.push(queryKey);
    },
  });

  assert.equal(result.failed, false);
  assert.deepEqual(refetchedKeys, [
    getListAuthoredCourseVersionsQueryKey(courseId),
    getListCourseAuthoringAuditQueryKey(courseId),
  ]);
});

test("manual History refresh reports a partial refetch failure", async () => {
  const courseId = "course-1";
  const failedKey = getListCourseAuthoringAuditQueryKey(courseId);
  const result = await refreshAuthoringHistory({
    courseId,
    refetchQueries: async queryKey => {
      if (JSON.stringify(queryKey) === JSON.stringify(failedKey)) {
        throw new Error("Audit history unavailable");
      }
    },
  });

  assert.equal(result.failed, true);
});

test("History refresh status is accessible while refreshing and after failure", () => {
  const refreshing = renderToStaticMarkup(<HistoryRefreshStatus isRefreshing failed={false} />);
  const failed = renderToStaticMarkup(<HistoryRefreshStatus isRefreshing={false} failed />);

  assert.match(refreshing, /aria-live="polite"/);
  assert.match(refreshing, /Refreshing History\./);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /History could not be refreshed\./);
  assert.match(failed, /Try again\./);
});

test("published version history displays the authoring revision returned by the API", () => {
  const response = [courseVersion({ id: "version-current", authoringRevision: 17 })];
  const markup = renderToStaticMarkup(<PublishedVersionHistory versions={response} />);

  assert.match(markup, /data-testid="text-authoring-revision-version-current"/);
  assert.match(markup, /Authoring revision: 17/);
});

test("published version history labels revision zero as a legacy version", () => {
  const response = [courseVersion({ id: "version-legacy", authoringRevision: 0 })];
  const markup = renderToStaticMarkup(<PublishedVersionHistory versions={response} />);

  assert.match(markup, /data-testid="text-authoring-revision-version-legacy"/);
  assert.match(markup, /Authoring revision: Legacy version/);
  assert.doesNotMatch(markup, /Authoring revision: 0/);
});

test("successful publish refetches version and audit history and shows the latest revision without reload", async () => {
  const courseId = "course-1";
  const previousVersion = courseVersion({
    id: "version-previous",
    version: 2,
    authoringRevision: 16,
  });
  const publishedVersion = courseVersion({
    id: "version-latest",
    version: 3,
    authoringRevision: 17,
  });
  let versions = [previousVersion];
  let versionHistoryRequests = 0;
  let auditHistoryRequests = 0;
  const invalidatedKeys: unknown[] = [];

  const result = await publishAuthoredCourseAndRefresh({
    courseId,
    publish: async ({ courseId: publishedCourseId }) => {
      assert.equal(publishedCourseId, courseId);
      return publishedVersion;
    },
    invalidateQueries: async (queryKey) => {
      invalidatedKeys.push(queryKey);

      if (JSON.stringify(queryKey) === JSON.stringify(getListAuthoredCourseVersionsQueryKey(courseId))) {
        versionHistoryRequests += 1;
        versions = [publishedVersion, previousVersion];
      }

      if (JSON.stringify(queryKey) === JSON.stringify(getListCourseAuthoringAuditQueryKey(courseId))) {
        auditHistoryRequests += 1;
      }
    },
  });

  assert.equal(result.version, publishedVersion);
  assert.equal(result.historyRefreshFailed, false);
  assert.equal(versionHistoryRequests, 1);
  assert.equal(auditHistoryRequests, 1);
  assert.ok(invalidatedKeys.some((key) =>
    JSON.stringify(key) === JSON.stringify(getListAuthoredCourseVersionsQueryKey(courseId))
  ));
  assert.ok(invalidatedKeys.some((key) =>
    JSON.stringify(key) === JSON.stringify(getListCourseAuthoringAuditQueryKey(courseId))
  ));

  const historyMarkup = renderToStaticMarkup(<PublishedVersionHistory versions={versions} />);
  assert.match(historyMarkup, /data-testid="version-item-version-latest"/);
  assert.match(historyMarkup, /Authoring revision: 17/);
});

for (const failedHistoryRefresh of ["version", "audit"] as const) {
  test(`successful publish remains successful when ${failedHistoryRefresh} history refresh fails`, async () => {
    const courseId = "course-1";
    const publishedVersion = courseVersion();
    const failedKey = failedHistoryRefresh === "version"
      ? getListAuthoredCourseVersionsQueryKey(courseId)
      : getListCourseAuthoringAuditQueryKey(courseId);

    const result = await publishAuthoredCourseAndRefresh({
      courseId,
      publish: async () => publishedVersion,
      invalidateQueries: async (queryKey) => {
        if (JSON.stringify(queryKey) === JSON.stringify(failedKey)) {
          throw new Error(`${failedHistoryRefresh} history unavailable`);
        }
      },
    });

    assert.equal(result.version, publishedVersion);
    assert.equal(result.historyRefreshFailed, true);
  });
}

for (const failedHistoryRefresh of ["version", "audit"] as const) {
  test(`real QueryClient reports a failed ${failedHistoryRefresh} history refetch after publish`, async () => {
    const courseId = "course-1";
    const publishedVersion = courseVersion();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const failedKey = failedHistoryRefresh === "version"
      ? getListAuthoredCourseVersionsQueryKey(courseId)
      : getListCourseAuthoringAuditQueryKey(courseId);
    const queryFn = async () => {
      throw new Error(`${failedHistoryRefresh} history unavailable`);
    };

    queryClient.setQueryData(failedKey, []);
    const observer = new QueryObserver(queryClient, {
      queryKey: failedKey,
      queryFn,
      staleTime: Infinity,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    try {
      const result = await publishAuthoredCourseAndRefresh({
        courseId,
        publish: async () => publishedVersion,
        invalidateQueries: (queryKey) => queryClient.invalidateQueries(
          { queryKey },
          { throwOnError: true },
        ),
      });

      assert.equal(result.version, publishedVersion);
      assert.equal(result.historyRefreshFailed, true);
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });
}
