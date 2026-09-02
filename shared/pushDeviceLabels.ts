export function getPushDeviceLabel(userAgent: string | null | undefined) {
  const value = userAgent ?? "";
  const device = /iPhone/i.test(value)
    ? "iPhone"
    : /iPad/i.test(value)
      ? "iPad"
      : /Android/i.test(value)
        ? "Android"
        : /Windows/i.test(value)
          ? "Windows"
          : /Macintosh|Mac OS X/i.test(value)
            ? "Mac"
            : "기기";
  const browser = /SamsungBrowser/i.test(value)
    ? "삼성 인터넷"
    : /Edg/i.test(value)
      ? "Edge"
      : /CriOS|Chrome/i.test(value)
        ? "Chrome"
        : /FxiOS|Firefox/i.test(value)
          ? "Firefox"
          : /Safari/i.test(value)
            ? "Safari"
            : "브라우저";
  return `${device} · ${browser}`;
}
