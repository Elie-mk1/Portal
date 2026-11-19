'use client';
import { useState } from 'react';

type Q = { id: number; question: string; expected: string[]; expect_none: boolean; why: string; traps: string };
type R = { id: number; pass: boolean; why: string; got: { name: string; score: number; reason: string; cv: string }[]; no_match: boolean; message?: string };

export default function TestRunner({ questions, last }: { questions: Q[]; last: { run_at: string; score: number; total: number; results: R[] } | null }) {
  const [results, setResults] = useState<Record<number, R>>(() => Object.fromEntries((last?.results || []).map((r) => [r.id, r])));
  const [running, setRunning] = useState<number | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(last?.run_at || null);
  const [error, setError] = useState<string | null>(null);

  async function runAll() {
    setError(null); setResults({});
    const out: R[] = [];
    for (const q of questions) {
      setRunning(q.id);
      try {
        const res = await fetch('/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: q.id }) });
        const r: R = await res.json();
        out.push(r); setResults((x) => ({ ...x, [q.id]: r }));
      } catch { const r = { id: q.id, pass: false, why: 'Network problem', got: [], no_match: false }; out.push(r); setResults((x) => ({ ...x, [q.id]: r })); }
    }
    setRunning(null);
    const s = await fetch('/api/test', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ results: out }) });
    if (!s.ok) setError('The run finished but could not be saved.');
    setRanAt(new Date().toISOString());
  }

  const done = Object.values(results);
  const score = done.filter((r) => r.pass).length;
  return (
    <div className="stack">
      <section className="sheet row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 24 }}>
          <div className="testscore" aria-live="polite">{done.length ? score : '–'}<span> / {questions.length}</span></div>
          <div><strong>{running ? `Asking question ${running} of ${questions.length}…` : done.length ? 'Bot score' : 'Not run yet'}</strong>
            <p className="muted small">{ranAt && !running ? 'Last run ' + new Date(ranAt).toLocaleString() : 'The bot answers each question exactly as it would in Slack. About 2 minutes in total.'}</p></div>
        </div>
        <button className="btn" onClick={runAll} disabled={running !== null}>{running ? 'Running…' : 'Run the 10 questions'}</button>
      </section>
      {error ? <p className="notice brick">{error}</p> : null}
      <section className="sheet">
        <table><thead><tr><th style={{ width: 40 }}>#</th><th>Question and right answer</th><th>Bot answer</th><th style={{ width: 90 }}>Result</th></tr></thead><tbody>
          {questions.map((q) => {
            const r = results[q.id];
            return (
              <tr key={q.id}>
                <td><strong>{q.id}</strong></td>
                <td><strong>{q.question}</strong>
                  <div style={{ marginTop: 6 }}>Right answer: {q.expect_none ? <em>nobody — the bot must say so</em> : q.expected.join(', ')}</div>
                  <div className="small muted" style={{ marginTop: 4 }}>{q.why} Traps: {q.traps}.</div></td>
                <td className="small">{running === q.id ? 'Asking…' : !r ? '—' : r.got.length === 0 ? (r.no_match ? 'No good match (said so)' : r.why) :
                  r.got.map((g) => <div key={g.name} style={{ marginBottom: 6 }}><strong>{g.score}</strong> {g.name}<div className="muted">{g.reason}</div><div className="muted">CV: {g.cv}</div></div>)}</td>
                <td>{r ? <span className={r.pass ? 'pass' : 'fail'}>{r.pass ? 'Pass' : 'Fail'}</span> : null}{r && !r.pass ? <div className="small muted">{r.why}</div> : null}</td>
              </tr>
            );
          })}
        </tbody></table>
      </section>
    </div>
  );
}
