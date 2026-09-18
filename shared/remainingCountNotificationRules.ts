export type RemainingOneNotificationState = {
  portalEnabled: boolean;
  message: string;
  remainingCount: number;
  totalCount: number;
  sentTotalCount: number | null;
};

export const REMAINING_ONE_ALERT_MESSAGE =
  "남은 수업이 1회입니다. 다음 수업 등록을 부탁드립니다.";

export function shouldSendRemainingOneNotification(
  state: RemainingOneNotificationState
) {
  return (
    state.portalEnabled &&
    state.message.trim().length > 0 &&
    Math.abs(state.remainingCount - 1) < 0.001 &&
    state.sentTotalCount !== state.totalCount
  );
}

export function shouldAttemptRemainingOneNotification(
  state: RemainingOneNotificationState,
  hasParentPhone: boolean
) {
  return (
    (state.portalEnabled || hasParentPhone) &&
    state.message.trim().length > 0 &&
    Math.abs(state.remainingCount - 1) < 0.001 &&
    state.sentTotalCount !== state.totalCount
  );
}
