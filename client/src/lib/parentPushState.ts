export async function readyPushRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("알림 연결 확인 시간이 초과되었습니다. 다시 시도해 주세요.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function registeredForGuardian(result: { success: boolean; studentCount: number }) {
  return result.success && result.studentCount > 0;
}
