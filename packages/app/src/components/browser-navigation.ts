const ALLOWED_BROWSER_PROTOCOLS = new Set(["http:", "https:", "file:"]);

export function getUnsafeNavigationMessage(
  url: string,
  labels: { invalidUrl: string; unsupportedProtocol: (protocol: string) => string },
): string | null {
  try {
    const parsed = new URL(url);
    if (ALLOWED_BROWSER_PROTOCOLS.has(parsed.protocol) || parsed.href === "about:blank") {
      return null;
    }
    return labels.unsupportedProtocol(parsed.protocol);
  } catch {
    return labels.invalidUrl;
  }
}
