'use client';
import { useActionState } from 'react';
import { rebuildShortlist, type RebuildState } from './actions';

export default function RebuildButton({ roleId }: { roleId: string }) {
  const [state, action, pending] = useActionState<RebuildState, FormData>(rebuildShortlist, {});
  return (
    <form action={action} className="row" style={{ marginTop: 14 }}>
      <input type="hidden" name="role_id" value={roleId} />
      <button className="btn quiet" type="submit" disabled={pending}>{pending ? 'Finding the top 5… (about a minute)' : 'Rebuild shortlist'}</button>
      {state.ok ? <span className="small" style={{ color: 'var(--green)' }}>Done — {state.matches} candidate{state.matches === 1 ? '' : 's'} found. The new shortlist is in Slack.</span> : null}
      {state.error ? <span className="small" style={{ color: 'var(--brick)' }}>{state.error}</span> : null}
      {!state.ok && !state.error && !pending ? <span className="muted small">Re-runs the search (e.g. after new CVs or if the AI was busy) and posts it to Slack. Approved or skipped people are kept.</span> : null}
    </form>
  );
}
