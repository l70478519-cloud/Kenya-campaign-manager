/** Stored references are links, never executable or credential-bearing URLs. */
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)) return null;
    const parts = url.hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}
export const PUBLIC_LISTENING_COVERAGE = {
  coverage: "Indexed news and public pages; not comprehensive direct social-platform access.",
  verification: "Source references are discovery leads; content is not independently verified.",
  sentimentMethod: "Automated content label; not representative public opinion or voting intention.",
};
