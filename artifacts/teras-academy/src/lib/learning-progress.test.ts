import { test, describe } from 'node:test';
import assert from 'node:assert';
import { isLearningCompleted, isOutcomeVerified, computeCourseProgress } from './learning-progress';
import { LearningCourse, LearningState, LearningActivityType, LearningResourceType } from '@workspace/api-client-react';

describe('learning-progress', () => {
  test('identifies completion states correctly', () => {
    assert.strictEqual(isLearningCompleted('NOT_STARTED'), false);
    assert.strictEqual(isLearningCompleted('IN_PROGRESS'), false);
    assert.strictEqual(isLearningCompleted('LEARNING_COMPLETED'), true);
    assert.strictEqual(isLearningCompleted('OUTCOME_VERIFIED'), true);
    assert.strictEqual(isLearningCompleted('READY'), true);
  });

  test('keeps learning completion separate from outcome verification', () => {
    assert.strictEqual(isOutcomeVerified('LEARNING_COMPLETED'), false);
    assert.strictEqual(isOutcomeVerified('OUTCOME_VERIFIED'), true);
    assert.strictEqual(isOutcomeVerified('REMEDIATION'), true);
    assert.strictEqual(isOutcomeVerified('READY'), true);
  });

  test('computes course progress and finds first incomplete action', () => {
    const course: LearningCourse = {
      id: 'c1',
      programId: 'p1',
      pathwayId: 'pw1',
      title: 'Course 1',
      description: 'Test',
      status: 'ACTIVE',
      sequence: 1,
      modules: [
        {
          id: 'm1',
          moduleId: 'm1',
          moduleCode: 'M01',
          moduleName: 'Module 1',
          sequence: 1,
          lessons: [
            {
              id: 'l1',
              moduleId: 'm1',
              title: 'Lesson 1',
              description: 'L1',
              sequence: 1,
              status: 'ACTIVE',
              estimatedDurationMinutes: 10,
              activities: [
                {
                  id: 'a1',
                  lessonId: 'l1',
                  pathwayId: 'pw1',
                  type: 'READING' as LearningActivityType,
                  title: 'A1',
                  description: 'A1',
                  sequence: 1,
                  required: true,
                  estimatedDurationMinutes: 5,
                  status: 'ACTIVE',
                  currentState: 'LEARNING_COMPLETED',
                  resources: [],
                  outcomes: []
                },
                {
                  id: 'a2',
                  lessonId: 'l1',
                  pathwayId: 'pw1',
                  type: 'VIDEO' as LearningActivityType,
                  title: 'A2',
                  description: 'A2',
                  sequence: 2,
                  required: true,
                  estimatedDurationMinutes: 5,
                  status: 'ACTIVE',
                  currentState: 'IN_PROGRESS',
                  resources: [],
                  outcomes: []
                }
              ]
            }
          ]
        }
      ]
    };

    const progress = computeCourseProgress(course);
    assert.strictEqual(progress.requiredCount, 2);
    assert.strictEqual(progress.completedCount, 1);
    assert.strictEqual(progress.percentage, 50);
    assert.deepStrictEqual(progress.firstIncompleteAction, {
      courseId: 'c1',
      moduleId: 'm1',
      lessonId: 'l1',
      activityId: 'a2'
    });
  });

  test('skips optional activities when computing progress', () => {
    const course: LearningCourse = {
      id: 'c1',
      programId: 'p1',
      pathwayId: 'pw1',
      title: 'Course 1',
      description: 'Test',
      status: 'ACTIVE',
      sequence: 1,
      modules: [
        {
          id: 'm1',
          moduleId: 'm1',
          moduleCode: 'M01',
          moduleName: 'Module 1',
          sequence: 1,
          lessons: [
            {
              id: 'l1',
              moduleId: 'm1',
              title: 'Lesson 1',
              description: 'L1',
              sequence: 1,
              status: 'ACTIVE',
              estimatedDurationMinutes: 10,
              activities: [
                {
                  id: 'a1',
                  lessonId: 'l1',
                  pathwayId: 'pw1',
                  type: 'READING' as LearningActivityType,
                  title: 'A1',
                  description: 'A1',
                  sequence: 1,
                  required: false,
                  estimatedDurationMinutes: 5,
                  status: 'ACTIVE',
                  currentState: 'NOT_STARTED',
                  resources: [],
                  outcomes: []
                },
                {
                  id: 'a2',
                  lessonId: 'l1',
                  pathwayId: 'pw1',
                  type: 'VIDEO' as LearningActivityType,
                  title: 'A2',
                  description: 'A2',
                  sequence: 2,
                  required: true,
                  estimatedDurationMinutes: 5,
                  status: 'ACTIVE',
                  currentState: 'LEARNING_COMPLETED',
                  resources: [],
                  outcomes: []
                }
              ]
            }
          ]
        }
      ]
    };

    const progress = computeCourseProgress(course);
    assert.strictEqual(progress.requiredCount, 1);
    assert.strictEqual(progress.completedCount, 1);
    assert.strictEqual(progress.percentage, 100);
    assert.strictEqual(progress.firstIncompleteAction, null);
  });
});
