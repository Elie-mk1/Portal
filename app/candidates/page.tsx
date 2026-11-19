import Link from 'next/link';
import { db } from '@/lib/supabase';
import { FILE_STATUS, when } from '@/lib/format';
import { Chip } from '@/components/Bits';

export const dynamic = 'force-dynamic';

export default async function Candidates({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams; const tab = sp.tab || 'all'; const q = (sp.q || '').trim();
  const s = db();
  const Tabs = (
    <div className="tabs" role="tablist">
      <Link href="/candidates" aria-current={tab === 'all' ? 'page' : undefined}>All candidates</Link>
      <Link href="/candidates?tab=attention" aria-current={tab === 'attention' ? 'page' : undefined}>Needs attention</Link>
      <Link href="/candidates?tab=files" aria-current={tab === 'files' ? 'page' : undefined}>Every CV file</Link>
    </div>
  );
  let body: React.ReactNode;
  if (tab === 'files' || tab === 'attention') {
    let fq = s.from('rc_v_files').select('*').order('uploaded_at', { ascending: false }).limit(300);
    if (tab === 'attention') fq = fq.in('status', ['unreadable', 'error', 'processing', 'queued']);
    const [{ data: files }, review] = await Promise.all([fq,
      tab === 'attention' ? s.from('rc_candidates').select('id,full_name,review_note,current_cv_id').eq('needs_review', true) : Promise.resolve({ data: [] as any[] })]);
    body = (
      <div className="stack">
        {tab === 'attention' && (
          <section className="sheet"><h2 style={{ marginBottom: 6 }}>Read from a scan or unclear — please double-check</h2>
            <p className="muted small" style={{ marginBottom: 12 }}>These people are searchable, but some details were read by AI from an image or look like a possible duplicate.</p>
            {(review.data || []).length === 0 ? <p className="muted">Nothing to check.</p> :
              <table><tbody>{(review.data || []).map((c: any) => <tr key={c.id}><td><Link href={`/candidates/${c.id}`}><strong>{c.full_name}</strong></Link></td><td>{c.review_note}</td><td>{c.current_cv_id ? <a href={`/cv/${c.current_cv_id}`} target="_blank" rel="noreferrer">Open CV</a> : null}</td></tr>)}</tbody></table>}
          </section>)}
        <section className="sheet">
          {tab === 'attention' && <><h2 style={{ marginBottom: 6 }}>Files that could not be read</h2><p className="muted small" style={{ marginBottom: 12 }}>They are not in search. Fix the file (or ask the candidate for a clearer copy) and upload it again.</p></>}
          {(files || []).length === 0 ? <p className="muted">{tab === 'attention' ? 'Every uploaded file was read.' : 'No CVs uploaded yet.'}</p> :
            <table><thead><tr><th>File</th><th>Status</th><th>What happened</th><th>Uploaded</th></tr></thead><tbody>
              {(files || []).map((f: any) => (
                <tr key={f.id}>
                  <td><a href={`/cv/${f.id}`} target="_blank" rel="noreferrer">{f.file_name}</a>{f.candidate_name ? <div className="small muted"><Link href={`/candidates/${f.candidate_id}`}>{f.candidate_name}</Link></div> : null}</td>
                  <td><Chip tone={FILE_STATUS[f.status]?.tone}>{FILE_STATUS[f.status]?.label || f.status}</Chip>{f.extraction_method === 'ocr_gemini' ? <div className="small muted" style={{ marginTop: 4 }}>Read from a scan</div> : null}</td>
                  <td className="small">{f.status_reason}</td>
                  <td className="small muted">{when(f.uploaded_at)}</td>
                </tr>))}
            </tbody></table>}
        </section>
      </div>
    );
  } else {
    let cq = s.from('rc_candidates').select('id,full_name,location,headline,needs_review,skills,languages,current_cv_id,updated_at').order('full_name').limit(500);
    if (q) cq = cq.or(`full_name.ilike.%${q.replace(/[,()%]/g, ' ')}%,cv_text.ilike.%${q.replace(/[,()%]/g, ' ')}%`);
    const { data: cands } = await cq;
    body = (
      <section className="sheet">
        <form className="row" style={{ marginBottom: 16 }} role="search">
          <input type="search" name="q" defaultValue={q} placeholder="Find by name or any word in the CV, e.g. Gorgias" aria-label="Find candidates" style={{ maxWidth: 420 }} />
          <button className="btn quiet" type="submit">Find</button>
          <span className="muted small">For ranked answers with reasons, ask the bot in Slack.</span>
        </form>
        <p className="muted small" style={{ marginBottom: 8 }}>{(cands || []).length} candidate{(cands || []).length === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}. Each person appears once, with their newest CV.</p>
        <table><thead><tr><th>Name</th><th>Skills</th><th>Languages</th><th>CV</th></tr></thead><tbody>
          {(cands || []).map((c: any) => (
            <tr key={c.id}>
              <td><Link href={`/candidates/${c.id}`}><strong>{c.full_name}</strong></Link><div className="small muted">{c.headline}</div><div className="small muted">{c.location}</div></td>
              <td className="small">{(c.skills || []).slice(0, 6).map((k: any) => k.name + (k.years != null ? ` (${k.years}y)` : '')).join(', ')}</td>
              <td className="small">{(c.languages || []).map((l: any) => l.language).join(', ')}</td>
              <td>{c.current_cv_id ? <a href={`/cv/${c.current_cv_id}`} target="_blank" rel="noreferrer">Open</a> : '—'}{c.needs_review ? <div><Chip tone="amber">Check</Chip></div> : null}</td>
            </tr>))}
        </tbody></table>
      </section>
    );
  }
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Candidates & CVs</h1><p className="muted">Duplicates are merged and an updated CV replaces the older one, so search never shows the same person twice.</p></div>
        <Link className="btn quiet" href="/upload">Upload CVs</Link></div>
      {Tabs}{body}
    </div>
  );
}
