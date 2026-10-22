import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Checks that a public link really opens before a mention is stored.
 *
 * Safety: only http/https on the default ports; every hostname (including
 * each redirect hop) must resolve to public addresses only, so a supplied
 * link can't make the server probe private or internal networks. The body is
 * never read. Residual risk: DNS could change between this check and the
 * request (rebinding); the request itself reads no content and follows no
 * redirects on its own.
 */

export type LinkStatus = "verified" | "unconfirmed" | "broken";
export type LinkCheck = { status: LinkStatus; httpStatus?: number; finalUrl?: string; reason?: string };

type Lookup = (host: string) => Promise<string[]>;
type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; redirect: "manual"; signal: AbortSignal }) =>
  Promise<{ status: number; headers: { get(name: string): string | null }; body?: { cancel(): Promise<void> } | null }>;

const defaultLookup: Lookup = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map(a => a.address);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, carrier-grade NAT, documentation, multicast and reserved addresses. */
export function isNonPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (v === 6) {
    const a = ip.toLowerCase();
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isNonPublicAddress(mapped[1]);
    if (a === "::" || a === "::1") return true;
    const first = parseInt(a.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 // fc00::/7 unique local
      || (first & 0xffc0) === 0xfe80 // fe80::/10 link-local
      || (first & 0xff00) === 0xff00 // ff00::/8 multicast
      || a.startsWith("2001:db8:"); // documentation
  }
  return true; // not an IP at all
}

async function hostIsPublic(host: string, lookup: Lookup): Promise<boolean> {
  const bare = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(bare) ? [bare] : await lookup(bare);
  return addresses.length > 0 && addresses.every(a => !isNonPublicAddress(a));
}

export async function checkPublicLink(
  url: string,
  opts: { timeoutMs?: number; maxRedirects?: number; lookup?: Lookup; fetcher?: Fetcher } = {},
): Promise<LinkCheck> {
  const lookup = opts.lookup ?? defaultLookup;
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  const timeoutMs = opts.timeoutMs ?? 6000;
  let current = url;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    let parsed: URL;
    try { parsed = new URL(current); } catch { return { status: "broken", reason: "invalid URL" }; }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { status: "broken", reason: "unsupported protocol" };
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return { status: "broken", reason: "non-standard port" };
    if (parsed.username || parsed.password) return { status: "broken", reason: "credentials in URL" };
    try {
      if (!(await hostIsPublic(parsed.hostname, lookup))) return { status: "broken", reason: "host is not a public address" };
    } catch {
      return { status: "broken", reason: "host does not resolve" };
    }

    let res;
    const attempt = (method: string) => fetcher(parsed.toString(), {
      method,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KenyaCampaignLinkCheck/1.0)", ...(method === "GET" ? { Range: "bytes=0-0" } : {}) },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    try {
      res = await attempt("HEAD");
      // Some servers reject HEAD; retry with a one-byte GET.
      if (res.status === 405 || res.status === 501 || res.status === 403) {
        await res.body?.cancel().catch(() => undefined);
        res = await attempt("GET");
      }
    } catch {
      return { status: "unconfirmed", reason: "no response in time" };
    }
    await res.body?.cancel().catch(() => undefined);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { status: "unconfirmed", httpStatus: res.status, reason: "redirect without location" };
      current = new URL(location, parsed).toString();
      continue;
    }
    if (res.status >= 200 && res.status < 300) return { status: "verified", httpStatus: res.status, finalUrl: current };
    if (res.status === 404 || res.status === 410) return { status: "broken", httpStatus: res.status, reason: "page not found" };
    // 401/403/429/5xx: the site exists but blocks automated checks or is down right now.
    return { status: "unconfirmed", httpStatus: res.status, reason: "site did not allow the check" };
  }
  return { status: "unconfirmed", reason: "too many redirects" };
}

/** Checks links with limited concurrency. */
export async function checkLinks(urls: string[], concurrency = 5, opts?: Parameters<typeof checkPublicLink>[1]): Promise<Map<string, LinkCheck>> {
  const out = new Map<string, LinkCheck>();
  const queue = [...new Set(urls)];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) out.set(next, await checkPublicLink(next, opts));
  }));
  return out;
}
