export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

const LOOPBACK_HTTP_URL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(?=[/?#]|$)/i;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** HTTPS ovunque; HTTP in chiaro solo verso questo dispositivo (loopback esatto). */
export function isAllowedServerUrl(url: string): boolean {
  if (/^https:\/\//i.test(url)) return true;
  if (!LOOPBACK_HTTP_URL.test(url) || /[\\\s]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function homeGreeting(connected: boolean, authenticatedUsername: string, hour = new Date().getHours()): string {
  const greeting = hour >= 5 && hour < 12
    ? 'Buongiorno'
    : hour >= 12 && hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const username = authenticatedUsername.trim();
  return connected && username ? `${greeting}, ${username}` : greeting;
}
