export const mobileSwipeRoutes = ["/", "/attendance", "/journal", "/learning-links", "/students", "/classes", "/parent-links"] as const;

/** 오른쪽에서 왼쪽으로 쓸면 다음 페이지, 왼쪽에서 오른쪽으로 쓸면 이전 페이지로 이동한다. */
export function getMobileSwipeDestination(pathname: string, deltaX: number, deltaY: number) {
  const currentIndex = mobileSwipeRoutes.indexOf(pathname as (typeof mobileSwipeRoutes)[number]);
  if (currentIndex < 0 || Math.abs(deltaX) < 72 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.35) return null;
  const destinationIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
  return mobileSwipeRoutes[destinationIndex] ?? null;
}
