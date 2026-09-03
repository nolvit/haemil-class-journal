export type PwaInstallEnvironment = {
  isAndroid: boolean;
  isIos: boolean;
  isInAppBrowser: boolean;
  isSamsungInternet: boolean;
  isChrome: boolean;
  isSafari: boolean;
  inAppName: string | null;
};

export function detectPwaInstallEnvironment(
  userAgent: string
): PwaInstallEnvironment {
  const isAndroid = /Android/i.test(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isSamsungInternet = /SamsungBrowser/i.test(userAgent);
  const isChrome =
    /Chrome|CriOS/i.test(userAgent) && !isSamsungInternet && !/EdgA|EdgiOS/i.test(userAgent);
  const isSafari =
    isIos &&
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  const inAppName = /KAKAOTALK/i.test(userAgent)
    ? "카카오톡"
    : /NAVER/i.test(userAgent)
      ? "네이버"
      : /Instagram/i.test(userAgent)
        ? "인스타그램"
        : /FBAN|FBAV/i.test(userAgent)
          ? "페이스북"
          : /Line\//i.test(userAgent)
            ? "LINE"
            : /DaumApps/i.test(userAgent)
              ? "다음"
              : null;
  const isAndroidWebView =
    isAndroid && (/; wv\)/i.test(userAgent) || /\bwv\b/i.test(userAgent));

  return {
    isAndroid,
    isIos,
    isInAppBrowser: Boolean(inAppName) || isAndroidWebView,
    isSamsungInternet,
    isChrome,
    isSafari,
    inAppName,
  };
}

export function getManualInstallInstruction(
  environment: PwaInstallEnvironment
) {
  if (environment.isIos)
    return "Safari 하단 공유 버튼 → 홈 화면에 추가를 선택해 주세요.";
  if (environment.isSamsungInternet)
    return "브라우저 메뉴(≡ 또는 ⋮) → 홈 화면에 추가/앱 설치를 선택해 주세요.";
  if (environment.isChrome)
    return "브라우저 메뉴(⋮) → 앱 설치 또는 홈 화면에 추가를 선택해 주세요.";
  if (environment.isAndroid)
    return "브라우저 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택해 주세요.";
  return "브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.";
}
