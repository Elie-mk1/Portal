import Link from 'next/link';
import { db } from '@/lib/supabase';
import { ROLE_STATUS, SHORTLIST_STATUS, when } from '@/lib/format';
import { Chip } from '@/components/Bits';

export const dynamic = 'force-dynamic';

export default async function Roles() {
  const s = db();
  const [{ data: roles }, { data: sl }] = await Promise.all([
    s.from('rc_roles').select('id,code,title,client_name,status,version,updated_at').order('created_at', { ascending: false }),
    s.from('rc_v_shortlist').select('role_id,full_name,score,status,rank').order('rank'),
  ]);
  const byRole = new Map<string, any[]>();
  for (const r of sl || []) { const a = byRole.get(r.role_id) || []; a.push(r); byRole.set(r.role_id, a); }
  const open = (roles || []).filter((r) => r.status === 'open');
  const other = (roles || []).filter((r) => r.status !== 'open');
  const Row = ({ r }: { r: any }) => {
    const list = byRole.get(r.id) || [];
    return (
      <tr>
        <td style={{ width: '38%' }}><Link href={`/roles/${r.id}`}><strong>{r.title}</strong></Link><div className="muted small">{r.client_name || 'Client not named'} — {r.code}, JD v{r.version}</div></td>
        <td><Chip tone={ROLE_STATUS[r.status]?.tone}>{ROLE_STATUS[r.status]?.label || r.status}</Chip><div className="muted small" style={{ marginTop: 4 }}>Updated {when(r.updated_at)}</div></td>
        <td>{list.length === 0 ? <span className="muted small">{r.status === 'open' ? 'No candidate meets every must-have' : 'Shortlist appears after approval'}</span> :
          list.map((c) => <div key={c.full_name} className="small"><strong>{c.score}</strong> {c.full_name} <span className="muted">— {SHORTLIST_STATUS[c.status]?.label}</span></div>)}</td>
      </tr>
    );
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Roles & shortlists</h1><p className="muted">Each role starts from a client call. Its top 5 candidates appear once you approve the job description in Slack.</p></div>
        <Link className="btn" href="/roles/new">New role from call notes</Link>
      </div>
      <section className="sheet">
        <h2 style={{ marginBottom: 12 }}>Open roles</h2>
        {open.length === 0 ? <p className="muted">No open roles yet. A role opens when you click Approve on its job description in Slack.</p> :
          <table><thead><tr><th>Role</th><th>Status</th><th>Shortlist (score, name)</th></tr></thead><tbody>{open.map((r) => <Row key={r.id} r={r} />)}</tbody></table>}
      </section>
      {other.length > 0 && (
        <section className="sheet">
          <h2 style={{ marginBottom: 12 }}>Drafts and closed roles</h2>
          <table><thead><tr><th>Role</th><th>Status</th><th>Shortlist</th></tr></thead><tbody>{other.map((r) => <Row key={r.id} r={r} />)}</tbody></table>
        </section>
      )}
    </div>
  );
}
