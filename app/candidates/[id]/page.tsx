import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { FILE_STATUS, when } from '@/lib/format';
import { Chip } from '@/components/Bits';

export const dynamic = 'force-dynamic';

export default async function Candidate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = db();
  const [{ data: c }, { data: files }, { data: sl }] = await Promise.all([
    s.from('rc_candidates').select('id,full_name,email,alt_emails,phone,location,headline,languages,skills,profile,needs_review,review_note,current_cv_id').eq('id', id).maybeSingle(),
    s.from('rc_v_files').select('*').eq('candidate_id', id).order('uploaded_at', { ascending: false }),
    s.from('rc_shortlists').select('id,score,status,role_id,rc_roles(title,code)').eq('candidate_id', id),
  ]);
  if (!c) notFound();
  const p = c.profile || {};
  return (
    <div className="stack">
      <div className="page-head"><div>
        <p className="muted small"><Link href="/candidates">Candidates</Link></p>
        <h1 style={{ marginTop: 6 }}>{c.full_name}</h1>
        <p className="muted">{c.headline} — {c.location}</p></div>
        {c.current_cv_id ? <a className="btn" href={`/cv/${c.current_cv_id}`} target="_blank" rel="noreferrer">Open current CV</a> : null}
      </div>
      {c.needs_review && <div className="notice amber">{c.review_note}</div>}
      <div className="grid2">
        <section className="sheet stack">
          <div><h3>Skills (years from the CV)</h3><ul>{(c.skills || []).map((k: any, i: number) => <li key={i}>{k.name}{k.years != null ? ` — ${k.years} yrs` : ''}{k.evidence ? <span className="muted small"> ({k.evidence})</span> : null}</li>)}</ul></div>
          <div><h3>Languages</h3><p>{(c.languages || []).map((l: any) => `${l.language} (${l.level})`).join(', ') || '—'}</p></div>
          <div><h3>Experience</h3><ul>{(p.experience || []).map((e: any, i: number) => <li key={i}><strong>{e.title}</strong>, {e.company} <span className="muted small">{e.start || '?'} – {e.end || '?'}</span></li>)}</ul></div>
          {(p.certifications || []).length > 0 && <div><h3>Certifications</h3><ul>{p.certifications.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
        </section>
        <div className="stack">
          <section className="sheet"><h3 style={{ marginBottom: 8 }}>Contact</h3>
            <p>{c.email}{(c.alt_emails || []).length ? <span className="muted small"> (also {c.alt_emails.join(', ')})</span> : null}</p><p>{c.phone}</p>
            <p className="muted small" style={{ marginTop: 8 }}>While testing, emails go to the tester's inbox, never to this address.</p></section>
          <section className="sheet"><h3 style={{ marginBottom: 8 }}>CV files</h3>
            <table><tbody>{(files || []).map((f: any) => (
              <tr key={f.id}><td><a href={`/cv/${f.id}`} target="_blank" rel="noreferrer">{f.file_name}</a><div className="small muted">{f.status_reason}</div></td>
                <td><Chip tone={FILE_STATUS[f.status]?.tone}>{FILE_STATUS[f.status]?.label}</Chip><div className="small muted">{when(f.uploaded_at)}</div></td></tr>))}</tbody></table></section>
          {(sl || []).length > 0 && <section className="sheet"><h3 style={{ marginBottom: 8 }}>Shortlisted for</h3>
            <ul>{(sl || []).map((x: any) => <li key={x.id}><Link href={`/roles/${x.role_id}`}>{x.rc_roles?.title}</Link> — score {x.score}, {x.status}</li>)}</ul></section>}
        </div>
      </div>
    </div>
  );
}
