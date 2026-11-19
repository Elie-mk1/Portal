import Link from 'next/link';

export function Chip({ tone = 'muted', children }: { tone?: string; children: React.ReactNode }) {
  return <span className={'chip ' + tone}>{children}</span>;
}

export type MatchRow = {
  full_name: string; score: number; reason?: string | null; cv_file_name?: string | null; cv_file_id?: string | null;
  location?: string | null; needs_review?: boolean | null; review_note?: string | null; candidate_id?: string;
};

// Score + meter (the tick at 60 = meets every must-have) + 2-line reason + the CV it came from
export function Match({ m, right }: { m: MatchRow; right?: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, m.score || 0));
  return (
    <div className="match">
      <div className="score" aria-label={`Score ${pct} out of 100`}>{pct}<small>of 100</small></div>
      <div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{m.candidate_id ? <Link href={`/candidates/${m.candidate_id}`}>{m.full_name}</Link> : m.full_name}{m.location ? <span className="muted small" style={{ fontFamily: 'var(--body)', fontWeight: 400 }}>  {m.location}</span> : null}</h3>
          {right}
        </div>
        <div className="meter" aria-hidden="true"><i style={{ width: pct + '%' }} /><b title="60 = meets every must-have" /></div>
        <p className="reason">{m.reason}</p>
        <p className="cvfile">
          From CV:{' '}
          {m.cv_file_id ? <a href={`/cv/${m.cv_file_id}`} target="_blank" rel="noreferrer">{m.cv_file_name}</a> : (m.cv_file_name || 'unknown file')}
          {m.needs_review ? <> <Chip tone="amber">{m.review_note || 'Needs a human check'}</Chip></> : null}
        </p>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="sheet"><h3>{title}</h3>{children ? <div className="muted" style={{ marginTop: 8 }}>{children}</div> : null}</div>;
}
