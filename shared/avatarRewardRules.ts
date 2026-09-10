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
  return [50, 100, 150, 200][Math.min(completedOrders, 3)];
}
export const avatarModes = ["original", "wannabe", "superstar"] as const;
export const rewardGuide = `수업한 만큼 포인트가 쌓여요! 실제 수업시간 1분마다 1P, 하루 최대 150P가 적립돼요. 하원 기록이 없으면 그날은 0P예요. 생성 시도가 거듭될수록 더 많은 포인트가 필요하며, 4회차부터 비용이 고정돼요. 원하는 부위만 선택할 수 있고 선택한 부위와 장신구에 제작비가 더해져요. 워너비는 100P, 슈퍼스타는 200P가 추가돼요. 랜덤은 누를 때 표시된 포인트가 즉시 차감돼요.`;

export const modeSurcharge = {
  original: 0,
  wannabe: 100,
  superstar: 200,
} as const;
export function avatarOrderPrice(
  completedOrders: number,
  mode: keyof typeof modeSurcharge,
  selectedParts = 0,
  accessories = 0
) {
  if (!(mode in modeSurcharge)) throw new Error("Invalid avatar mode");
  const tier = Math.min(completedOrders, 3);
  return (
    avatarPrice(completedOrders) +
    modeSurcharge[mode] +
    selectedParts * [10, 15, 20, 30][tier] +
    accessories * [5, 10, 15, 15][tier]
  );
}
export function randomPrice(completedOrders: number, all = false) {
  if (!Number.isInteger(completedOrders) || completedOrders < 0)
    throw new Error("Invalid completed order count");
  return (all ? [10, 20, 30, 50] : [1, 2, 3, 5])[Math.min(completedOrders, 3)];
}
