import { db } from '@/lib/supabase';
import TestRunner from './TestRunner';

export const dynamic = 'force-dynamic';

export default async function TestPage() {
  const s = db();
  const [{ data: qs }, { data: runs }] = await Promise.all([
    s.from('rc_test_questions').select('*').order('id'),
    s.from('rc_test_runs').select('*').order('run_at', { ascending: false }).limit(1),
  ]);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Test: 10 questions</h1>
        <p className="muted">Ten questions with known right answers, built into the sample CVs on purpose: duplicates, updated CVs, a scanned CV, look-alike skills, and two questions where nobody qualifies. A question only counts as passed if the bot returns exactly the right people.</p></div></div>
      <TestRunner questions={qs || []} last={runs?.[0] || null} />
    </div>
  );
}
