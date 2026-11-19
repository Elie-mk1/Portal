import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { callN8n } from '@/lib/n8n';
import { nameKey } from '@/lib/names';

export const maxDuration = 300;

// Ask the bot ONE test question (the page calls this 10 times, one after another).
// Pass = the bot returned exactly the expected people (no one missing, no one extra),
// or, for "nobody" questions, the bot said there is no match.
export async function POST(req: Request) {
  const { id } = await req.json();
  const { data: t } = await db().from('rc_test_questions').select('*').eq('id', id).single();
  if (!t) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
  const r = await callN8n('em-p3-search', { question: t.question }, 280_000);
  const res = r.data || {};
  const got: { name: string; score: number; reason: string; cv: string }[] = (res.matches || []).map((m: any) => ({ name: m.full_name, score: m.score, reason: m.reason, cv: m.cv_file_name }));
  let pass = false; let why = '';
  if (!r.ok || res.error) { why = 'Bot error: ' + (res.error || res.message || r.status); }
  else if (t.expect_none) { pass = res.no_match === true && got.length === 0; why = pass ? 'Correctly said nobody matches' : 'Should have said nobody matches'; }
  else {
    const exp = new Set<string>((t.expected as string[]).map(nameKey));
    const g = new Set(got.map((x) => nameKey(x.name)));
    const missing = (t.expected as string[]).filter((n) => !g.has(nameKey(n)));
    const extra = got.filter((x) => !exp.has(nameKey(x.name))).map((x) => x.name);
    pass = missing.length === 0 && extra.length === 0 && g.size === got.length;
    why = pass ? 'Exactly the right people' : [missing.length ? 'Missing: ' + missing.join(', ') : '', extra.length ? 'Wrong: ' + extra.join(', ') : '', g.size !== got.length ? 'Same person listed twice' : ''].filter(Boolean).join('. ');
  }
  return NextResponse.json({ id: t.id, pass, why, got, no_match: !!res.no_match, message: res.message || null });
}

// Save a finished run.
export async function PUT(req: Request) {
  const { results } = await req.json();
  const score = (results || []).filter((x: any) => x.pass).length;
  const { error } = await db().from('rc_test_runs').insert({ score, total: (results || []).length, results });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, score });
}
