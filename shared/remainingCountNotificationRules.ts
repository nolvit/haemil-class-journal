export type RemainingTwoNotificationState = {
  portalEnabled: boolean;
  message: string;
  remainingCount: number;
  totalCount: number;
  sentTotalCount: number | null;
  lessonUnitMultiplier?: number;
};

import { getRemainingTwoClassAlertCount } from "./studentCountPolicy";

export const REMAINING_TWO_ALERT_MESSAGE =
  "남은 수업이 2회입니다. 다음 수업 등록을 부탁드립니다.";

export function shouldSendRemainingTwoNotification(
  state: RemainingTwoNotificationState
) {
  return (
    state.portalEnabled &&
    state.message.trim().length > 0 &&
    Math.abs(
      state.remainingCount -
        getRemainingTwoClassAlertCount(state.lessonUnitMultiplier ?? 1)
    ) < 0.001 &&
    state.sentTotalCount !== state.totalCount
  );
}
