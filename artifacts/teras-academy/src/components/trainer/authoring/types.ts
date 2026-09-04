export type AuthoringEntityType = 'COURSE' | 'COURSE_MODULE' | 'LESSON' | 'ACTIVITY' | 'OUTCOME' | 'RESOURCE';

export interface AuthoringSelection {
  entity: AuthoringEntityType;
  id: string;
  parentId?: string;
  item: any;
}
