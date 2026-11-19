import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, sessionToken } from '@/lib/auth';

async function login(formData: FormData) {
  'use server';
  const pw = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/');
  if (!process.env.PORTAL_PASSWORD || pw !== process.env.PORTAL_PASSWORD) redirect('/login?error=1&next=' + encodeURIComponent(next));
  (await cookies()).set(COOKIE, await sessionToken(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 14 });
  redirect(next.startsWith('/') ? next : '/');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p className="muted" style={{ margin: '10px 0 24px' }}>Enter the portal passcode your team shared with you.</p>
      {sp.error ? <p className="notice brick" style={{ marginBottom: 16 }}>That passcode is not right. Check it and try again.</p> : null}
      <form action={login} className="sheet">
        <input type="hidden" name="next" value={sp.next || '/'} />
        <div className="field"><label htmlFor="pw">Passcode</label><input id="pw" name="password" type="password" autoFocus required /></div>
        <button className="btn" type="submit">Sign in</button>
      </form>
    </div>
  );
}
