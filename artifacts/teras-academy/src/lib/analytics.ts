type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    // Replit's deployment proxy injects Umami after analytics is enabled.
    window.umami?.track(name, data);
  } catch {
    // Analytics is optional and must never interrupt the learning journey.
  }
}

type LearningAction =
  | "continue_learning"
  | "start_course"
  | "open_lesson"
  | "start_activity"
  | "complete_activity";

type LearningLocation =
  | "learning_list_next_action"
  | "course_lesson_list"
  | "lesson_activity";

type LearningActionData = {
  action: LearningAction;
  location: LearningLocation;
  courseId: string;
  moduleId?: string;
  lessonId?: string;
  activityId?: string;
};

export function trackLearningAction({
  action,
  location,
  courseId,
  moduleId,
  lessonId,
  activityId,
}: LearningActionData): void {
  trackEvent("learning_action", {
    action,
    location,
    course_id: courseId,
    ...(moduleId ? { module_id: moduleId } : {}),
    ...(lessonId ? { lesson_id: lessonId } : {}),
    ...(activityId ? { activity_id: activityId } : {}),
  });
}

type ResourceOpenedData = {
  activityId: string;
  resourceId: string;
  resourceType: string;
};

export function trackResourceOpened({
  activityId,
  resourceId,
  resourceType,
}: ResourceOpenedData): void {
  trackEvent("learning_resource_opened", {
    activity_id: activityId,
    resource_id: resourceId,
    resource_type: resourceType,
    location: "lesson_activity_resources",
  });
}

type ReadinessQueueType =
  | "trainer_practice"
  | "trainer_evidence"
  | "assessor_readiness";

type ReadinessQueueOpenedData = {
  queueType: ReadinessQueueType;
  pathway: string;
  hasBlocker: boolean;
};

type ReadinessDecisionRecordedData = ReadinessQueueOpenedData & {
  outcome: string;
};

export function trackReadinessQueueOpened({
  queueType,
  pathway,
  hasBlocker,
}: ReadinessQueueOpenedData): void {
  trackEvent("readiness_queue_opened", {
    queue_type: queueType,
    pathway,
    has_blocker: hasBlocker,
  });
}

export function trackReadinessDecisionRecorded({
  queueType,
  pathway,
  hasBlocker,
  outcome,
}: ReadinessDecisionRecordedData): void {
  trackEvent("readiness_decision_recorded", {
    queue_type: queueType,
    pathway,
    has_blocker: hasBlocker,
    outcome,
  });
}