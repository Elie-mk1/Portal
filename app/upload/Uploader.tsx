'use client';
import { useRef, useState } from 'react';

type Row = { name: string; state: 'waiting' | 'reading' | 'done' | 'flagged' | 'failed'; message?: string; action?: string };
const LABEL: Record<string, string> = { created: 'New candidate', updated: 'Updated CV', duplicate: 'Duplicate', older_version: 'Older version' };
const TONE: Record<string, string> = { waiting: 'muted', reading: 'navy', done: 'green', flagged: 'brick', failed: 'brick' };

export default function Uploader() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(files: File[]) {
    if (!files.length || busy) return;
    const start = rows.length;
    setRows((r) => [...r, ...files.map((f) => ({ name: f.name, state: 'waiting' as const }))]);
    setBusy(true);
    for (let i = 0; i < files.length; i++) {          // one at a time keeps the free AI quota happy
      const idx = start + i;
      setRows((r) => r.map((x, j) => (j === idx ? { ...x, state: 'reading' } : x)));
      let row: Row;
      try {
        const fd = new FormData(); fd.append('file', files[i]);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({ message: 'Unexpected answer from the server' }));
        row = j.flagged ? { name: files[i].name, state: 'flagged', message: j.message }
          : j.ok ? { name: files[i].name, state: 'done', message: j.message, action: j.action }
          : { name: files[i].name, state: 'failed', message: j.message || j.error || 'Upload failed' };
      } catch (e: any) {
        row = { name: files[i].name, state: 'failed', message: 'Network problem — upload this file again' };
      }
      setRows((r) => r.map((x, j) => (j === idx ? row : x)));
    }
    setBusy(false);
  }

  const done = rows.filter((r) => r.state === 'done').length;
  const flagged = rows.filter((r) => r.state === 'flagged' || r.state === 'failed').length;
  return (
    <div className="stack">
      <div className={'drop' + (over ? ' over' : '')} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); run(Array.from(e.dataTransfer.files)); }}>
        <h3>Drop CV files here, or click to choose</h3>
        <p className="muted" style={{ marginTop: 6 }}>You can select many at once. Each takes about 10 seconds.</p>
        <input ref={input} type="file" multiple hidden accept=".pdf,.docx,.doc,.jpg,.jpeg,.png" onChange={(e) => { run(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </div>
      {rows.length > 0 && (
        <section className="sheet">
          <div className="section-title"><h2>{busy ? `Reading ${rows.filter((r) => r.state === 'waiting' || r.state === 'reading').length} file(s)…` : 'Upload finished'}</h2>
            <span className="muted small">{done} read, {flagged} need attention</span></div>
          <table><tbody>{rows.map((r, i) => (
            <tr key={i}><td style={{ width: '34%' }}><strong>{r.name}</strong></td>
              <td style={{ width: 150 }}><span className={'chip ' + TONE[r.state]}>{r.state === 'done' ? (LABEL[r.action || ''] || 'Read') : r.state === 'reading' ? 'Reading…' : r.state === 'waiting' ? 'Waiting' : 'Needs attention'}</span></td>
              <td className="small">{r.message}</td></tr>))}</tbody></table>
        </section>
      )}
    </div>
  );
}
