import Link from 'next/link';
import { db } from '@/lib/supabase';
import { when, ROLE_STATUS } from '@/lib/format';
import { Chip } from '@/components/Bits';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const s = db();
  const [roles, cands, attention, review, outreach, events] = await Promise.all([
    s.from('rc_roles').select('id,code,title,client_name,status,updated_at').order('updated_at', { ascending: false }).limit(6),
    s.from('rc_candidates').select('id', { count: 'exact', head: true }),
    s.from('rc_cv_files').select('id', { count: 'exact', head: true }).in('status', ['unreadable', 'error']),
    s.from('rc_candidates').select('id', { count: 'exact', head: true }).eq('needs_review', true),
    s.from('rc_outreach').select('status'),
    s.from('rc_events').select('id,type,message,created_at').order('created_at', { ascending: false }).limit(12),
  ]);
  const pending = (roles.data || []).filter((r) => r.status === 'pending_approval');
  const out = outreach.data || [];
  const needs = (attention.count || 0) + (review.count || 0);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Good to see you</h1>
          <p className="muted">Paste call notes to create a role, approve the job description and the shortlist in Slack, and follow each candidate here.</p>
        </div>
        <div className="row"><Link className="btn" href="/roles/new">New role from call notes</Link><Link className="btn quiet" href="/upload">Upload CVs</Link></div>
      </div>

      {pending.length > 0 && (
        <div className="notice amber">
          <strong>{pending.length === 1 ? 'One job description is' : `${pending.length} job descriptions are`} waiting for your approval in Slack:</strong>{' '}
          {pending.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<Link href={`/roles/${r.id}`}>{r.title}</Link></span>)}
        </div>
      )}
      {needs > 0 && (
        <div className="notice brick">
          <strong>{needs} CV{needs === 1 ? '' : 's'} need{needs === 1 ? 's' : ''} a human look</strong> — unreadable files or details read from a scan. <Link href="/candidates?tab=attention">Review them</Link>
        </div>
      )}

      <div className="grid2">
        <section className="sheet">
          <div className="section-title"><h2>Latest roles</h2><Link href="/roles" className="small">All roles</Link></div>
          {(roles.data || []).length === 0 ? <p className="muted">No roles yet. Start with <Link href="/roles/new">New role from call notes</Link>.</p> :
            <table><tbody>{(roles.data || []).map((r) => (
              <tr key={r.id}><td><Link href={`/roles/${r.id}`}><strong>{r.title}</strong></Link><div className="muted small">{r.client_name || 'Client not named'} — {r.code}</div></td>
                <td style={{ textAlign: 'right' }}><Chip tone={ROLE_STATUS[r.status]?.tone}>{ROLE_STATUS[r.status]?.label || r.status}</Chip></td></tr>))}</tbody></table>}
        </section>
        <section className="sheet">
          <h2 style={{ marginBottom: 14 }}>At a glance</h2>
          <table><tbody>
            <tr><td>Candidates in the database</td><td style={{ textAlign: 'right' }}><strong>{cands.count ?? 0}</strong></td></tr>
            <tr><td>Being emailed now</td><td style={{ textAlign: 'right' }}><strong>{out.filter((o) => o.status === 'active').length}</strong></td></tr>
            <tr><td>Replied</td><td style={{ textAlign: 'right' }}><strong>{out.filter((o) => o.status === 'replied').length}</strong></td></tr>
            <tr><td>CVs needing a look</td><td style={{ textAlign: 'right' }}><strong>{needs}</strong></td></tr>
          </tbody></table>
        </section>
      </div>

      <section className="sheet">
        <h2 style={{ marginBottom: 10 }}>What happened recently</h2>
        {(events.data || []).length === 0 ? <p className="muted">Nothing yet.</p> :
          <table><tbody>{(events.data || []).map((e) => (
            <tr key={e.id}><td className="muted small" style={{ width: 150 }}>{when(e.created_at)}</td><td>{e.message}</td></tr>))}</tbody></table>}
      </section>
    </div>
  );
}
