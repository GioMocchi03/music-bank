export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

export function homeGreeting(connected: boolean, authenticatedUsername: string, hour = new Date().getHours()): string {
  const greeting = hour >= 5 && hour < 12
    ? 'Buongiorno'
    : hour >= 12 && hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const username = authenticatedUsername.trim();
  return connected && username ? `${greeting}, ${username}` : greeting;
}
