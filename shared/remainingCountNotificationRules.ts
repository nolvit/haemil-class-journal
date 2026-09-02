export type RemainingTwoNotificationState = {
  portalEnabled: boolean;
  message: string;
  remainingCount: number;
  totalCount: number;
  sentTotalCount: number | null;
};

export function shouldSendRemainingTwoNotification(
  state: RemainingTwoNotificationState
) {
  return (
    state.portalEnabled &&
    state.message.trim().length > 0 &&
    Math.abs(state.remainingCount - 2) < 0.001 &&
    state.sentTotalCount !== state.totalCount
  );
}
