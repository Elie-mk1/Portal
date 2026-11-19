import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { Markdown } from '@/lib/md';
import { ROLE_STATUS, SHORTLIST_STATUS, OUTREACH_STATUS, when } from '@/lib/format';
import { Chip, Match } from '@/components/Bits';
import RebuildButton from './RebuildButton';

export const dynamic = 'force-dynamic';

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = db();
  const [{ data: role }, { data: list }] = await Promise.all([
    s.from('rc_roles').select('*').eq('id', id).maybeSingle(),
    s.from('rc_v_shortlist').select('*').eq('role_id', id).order('rank'),
  ]);
  if (!role) notFound();
  const st = ROLE_STATUS[role.status] || { label: role.status, tone: 'muted' };
  const jd = role.jd || {};
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="muted small"><Link href="/roles">Roles</Link> / {role.code}</p>
          <h1 style={{ marginTop: 6 }}>{role.title}</h1>
          <p className="muted">{role.client_name || 'Client not named'}{role.client_email ? ` (${role.client_email})` : ''} — job description version {role.version}</p>
        </div>
        <Chip tone={st.tone}>{st.label}</Chip>
      </div>

      {role.status === 'pending_approval' && <div className="notice amber">This job description is in Slack waiting for Approve, Request changes or Reject. Nothing reaches the client or candidates before you approve.</div>}
      {role.status === 'drafting' && <div className="notice">The job description is being written. Refresh in a few seconds.</div>}
      {role.status === 'changes_requested' && <div className="notice amber">Changes requested{role.feedback ? `: “${role.feedback}”` : ''}. A new version will appear in Slack shortly.</div>}
      {role.status === 'open' && role.approved_by && <div className="notice green">Approved by {role.approved_by} on {when(role.approved_at)}.</div>}

      <section className="sheet">
        <div className="section-title"><h2>Top 5 candidates</h2><span className="muted small">Score 60+ means every must-have is met. Approve each one in Slack.</span></div>
        {role.status !== 'open' && (list || []).length === 0 ? <p className="muted">The shortlist is created automatically when the job description is approved.</p> :
          (list || []).length === 0 ? <div className="notice">No candidate in the database meets every must-have for this role. Upload more CVs, or ask in Slack with fewer requirements.</div> :
          (list || []).map((c: any) => (
            <Match key={c.id} m={c} right={
              <div className="row">
                <Chip tone={SHORTLIST_STATUS[c.status]?.tone}>{SHORTLIST_STATUS[c.status]?.label || c.status}</Chip>
                {c.outreach_status ? <Chip tone={c.outreach_status === 'replied' ? 'green' : 'navy'}>{OUTREACH_STATUS[c.outreach_status]}</Chip> : null}
              </div>} />
          ))}
        {role.status === 'open' && <RebuildButton roleId={role.id} />}
        {(list || []).some((c: any) => c.status_note) && <p className="notice brick small" style={{ marginTop: 12 }}>{(list || []).filter((c: any) => c.status_note).map((c: any) => `${c.full_name}: ${c.status_note}`).join(' — ')}</p>}
      </section>

      <div className="grid2">
        <section className="sheet">{role.jd_markdown ? <Markdown text={role.jd_markdown} /> : <p className="muted">No job description yet.</p>}</section>
        <div className="stack">
          {(role.open_questions || []).length > 0 && (
            <section className="sheet"><h3 style={{ marginBottom: 8 }}>Questions for the client</h3>
              <p className="muted small" style={{ marginBottom: 8 }}>The call left these unclear, so they are marked TBC instead of guessed.</p>
              <ul>{(role.open_questions || []).map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></section>)}
          {(jd.recruiter_notes || []).length > 0 && (
            <section className="sheet"><h3 style={{ marginBottom: 8 }}>Recruiter-only notes</h3><p className="muted small" style={{ marginBottom: 8 }}>Not shown to candidates.</p>
              <ul>{jd.recruiter_notes.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></section>)}
          <section className="sheet"><details><summary>Original call notes</summary><pre className="transcript">{role.transcript}</pre></details></section>
        </div>
      </div>
    </div>
  );
}
