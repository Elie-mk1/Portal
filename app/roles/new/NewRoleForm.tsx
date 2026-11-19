'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createRole, type NewRoleState } from './actions';
import { SAMPLES } from '@/lib/samples';

export default function NewRoleForm() {
  const [state, action, pending] = useActionState<NewRoleState, FormData>(createRole, {});
  const [text, setText] = useState('');
  const [client, setClient] = useState('');
  if (state.ok) {
    return (
      <div className="stack">
        <div className="notice green"><strong>Job description written for “{state.title}”.</strong> It is in Slack now, waiting for your Approve. Nothing has been sent to the client or to candidates.</div>
        {state.slack_error ? <div className="notice brick">Slack did not accept the message ({state.slack_error}). Ask your admin to run the “EM-P3 00 Setup” check.</div> : null}
        <div className="row"><Link className="btn" href={`/roles/${state.role_id}`}>Open the role</Link><a className="btn quiet" href="/roles/new">Create another role</a></div>
      </div>
    );
  }
  return (
    <form action={action} className="sheet">
      <div className="field">
        <label htmlFor="sample">Use a sample call <span className="hint">(optional — fills the box below)</span></label>
        <select id="sample" defaultValue="" onChange={(e) => { const s = SAMPLES.find((x) => x.id === e.target.value); if (s) { setText(s.text); setClient(s.client); } }}>
          <option value="">Choose a sample transcript…</option>
          {SAMPLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="client_name">Client</label><input id="client_name" name="client_name" type="text" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Summit Peak Marketing" /></div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="client_email">Client email <span className="hint">(the approved JD is sent here)</span></label><input id="client_email" name="client_email" type="email" placeholder="client@example.com" /></div>
      </div>
      <div className="field">
        <label htmlFor="transcript">Call notes or transcript</label>
        <textarea id="transcript" name="transcript" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole call — messy is fine." required />
      </div>
      {state.error ? <p className="notice brick" style={{ marginBottom: 16 }}>{state.error}</p> : null}
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Writing the job description…' : 'Write job description'}</button>
        <span className="muted small">Takes about 20 seconds. It goes to Slack for approval — never straight to the client.</span>
      </div>
    </form>
  );
}
