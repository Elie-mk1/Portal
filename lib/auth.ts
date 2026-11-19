// Tiny passcode gate shared by proxy.ts (edge) and the login action (node). Uses Web Crypto only.
export const COOKIE = 'em_portal';
export async function sessionToken(): Promise<string> {
  const pw = process.env.PORTAL_PASSWORD || '';
  const data = new TextEncoder().encode('em-portal-v1:' + pw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
