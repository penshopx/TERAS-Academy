export type UserId = string | null;
export type PreviousUserId = UserId | undefined;

export function hasIdentityChanged(previousUserId: PreviousUserId, userId: UserId): boolean {
  return previousUserId !== undefined && previousUserId !== userId;
}