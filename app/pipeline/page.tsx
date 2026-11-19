import { db, settings } from '@/lib/supabase';
import { when } from '@/lib/format';

export const dynamic = 'force-dynamic';
const ORDER = ['Approved', 'Contacted', 'Replied', 'Interviewing', 'Submitted to Client', 'Hired', 'No Response', 'Not a Fit'];

type Card = { id: string; name: string; role: string; stage: string; updated?: string };

async function fromGhl(s: Record<string, string>): Promise<{ cards: Card[]; stages: string[] } | { error: string }> {
  const token = process.env.GHL_API_KEY;
  const loc = s.ghl_location_id; const pipe = s.ghl_pipeline_id;
  if (!token) return { error: 'GHL_API_KEY is not set on the hosting platform' };
  if (!pipe) return { error: 'The GHL pipeline is not set up yet (run the “EM-P3 00 Setup” workflow)' };
  let stagesMap: Record<string, string> = {};
  try { stagesMap = JSON.parse(s.ghl_stages || '{}'); } catch {}
  const idToName = Object.fromEntries(Object.entries(stagesMap).map(([n, id]) => [id, n]));
  const base = (s.ghl_base || 'https://services.leadconnectorhq.com').replace(/\/+$/, '');
  const url = `${base}/opportunities/search?location_id=${encodeURIComponent(loc)}&pipeline_id=${encodeURIComponent(pipe)}&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) return { error: `GoHighLevel answered ${res.status}` };
  const j = await res.json();
  const cards: Card[] = (j.opportunities || [])
    .filter((o: any) => String(o.name || '').startsWith('EM-'))
    .map((o: any) => {
      const [who, role] = String(o.name).replace(/^EM-\s*/, '').split(' – ');
      return { id: o.id, name: o.contact?.name || who, role: role || '', stage: idToName[o.pipelineStageId] || 'Other', updated: o.updatedAt || o.createdAt };
    });
  const stages = Object.keys(stagesMap).length ? Object.keys(stagesMap) : ORDER;
  return { cards, stages };
}

async function fromDb(): Promise<{ cards: Card[]; stages: string[] }> {
  const { data } = await db().from('rc_v_shortlist').select('id,full_name,status,outreach_status,outreach_next_step,approved_at,role_id').eq('status', 'approved');
  const { data: roles } = await db().from('rc_roles').select('id,title');
  const t = new Map((roles || []).map((r) => [r.id, r.title]));
  const cards = (data || []).map((r: any) => ({
    id: r.id, name: r.full_name, role: t.get(r.role_id) || '', updated: r.approved_at,
    stage: r.outreach_status === 'replied' ? 'Replied' : r.outreach_status === 'no_response' ? 'No Response' : (r.outreach_next_step || 1) > 1 ? 'Contacted' : 'Approved',
  }));
  return { cards, stages: ORDER.slice(0, 3).concat(['No Response']) };
}

export default async function Pipeline() {
  const s = await settings();
  const live = await fromGhl(s);
  const fell = 'error' in live;
  const { cards, stages } = fell ? await fromDb() : live;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Candidate pipeline</h1>
        <p className="muted">Approved candidates by stage. Stages move by themselves when emails go out and when someone replies; you can also drag them in GoHighLevel.</p></div></div>
      {fell ? <div className="notice amber">Showing the copilot’s own records because the live GoHighLevel view is unavailable: {(live as any).error}.</div>
        : <p className="muted small">Live from GoHighLevel pipeline “{s.ghl_pipeline_name}”.</p>}
      <div className="board">
        {stages.map((st) => {
          const list = cards.filter((c) => c.stage === st);
          return (
            <section className="col" key={st} aria-label={st}>
              <h3>{st}<span className="muted">{list.length}</span></h3>
              {list.length === 0 ? <p className="muted small">Nobody here.</p> : list.map((c) => (
                <div className="card" key={c.id}><strong>{c.name}</strong><span className="muted">{c.role}</span><div className="small muted">{when(c.updated)}</div></div>))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
