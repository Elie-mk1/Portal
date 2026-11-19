import 'server-only';

// Calls one of our n8n webhooks. The shared secret header is added here, on the server.
export async function callN8n<T = any>(path: string, body: unknown, timeoutMs = 240_000): Promise<{ ok: boolean; status: number; data: T | any }> {
  const base = (process.env.N8N_WEBHOOK_BASE || '').replace(/\/+$/, '');
  const secret = process.env.N8N_WEBHOOK_SECRET || '';
  if (!base || !secret) throw new Error('N8N_WEBHOOK_BASE and N8N_WEBHOOK_SECRET must be set in the hosting environment.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-em-secret': secret },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* not json */ }
    if (Array.isArray(data) && data.length === 1) data = data[0];
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.name === 'AbortError' ? 'The automation took too long to answer' : String(e?.message || e) } };
  } finally {
    clearTimeout(t);
  }
}
