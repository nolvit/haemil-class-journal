/** Server-side reward policy; aggregate all sessions for one student/KST date first. */
export function attendancePoints(
  sessions: { arrival: number; departure: number | null }[]
) {
  if (sessions.some(s => s.departure === null)) return 0;
  const intervals = sessions
    .map(s => {
      if (
        !Number.isFinite(s.arrival) ||
        !Number.isFinite(s.departure) ||
        s.departure! < s.arrival
      )
        throw new Error("Invalid attendance interval");
      return [s.arrival, s.departure!] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    end = -Infinity;
  for (const [start, finish] of intervals) {
    total += Math.max(0, finish - Math.max(start, end));
    end = Math.max(end, finish);
  }
  return Math.min(150, Math.floor(total / 60_000));
}
export function avatarPrice(completedOrders: number) {
  if (!Number.isSafeInteger(completedOrders) || completedOrders < 0)
    throw new Error("Invalid order count");
  return [500, 1000, 1500, 2250][Math.min(completedOrders, 3)];
}
export const avatarModes = ["original", "wannabe", "superstar"] as const;
export const rewardGuide = `수업한 만큼 포인트가 쌓여요! 실제 수업시간 1분마다 1P, 하루 최대 150P가 적립돼요. 하원 기록이 없으면 그날은 0P예요. 첫 번째 스페셜 아바타는 500P, 두 번째는 1,000P, 세 번째는 1,500P, 네 번째부터는 2,250P예요. 하루 150P씩 주 5일 수업하면 3주(15일)에 2,250P를 모을 수 있어요. 사용 가능 포인트와 지금까지 모은 누적 포인트는 따로 표시돼요.`;
