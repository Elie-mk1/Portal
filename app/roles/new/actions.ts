'use server';
import { callN8n } from '@/lib/n8n';

export type NewRoleState = { ok?: boolean; error?: string; role_id?: string; title?: string; slack_error?: string | null };

export async function createRole(_: NewRoleState, form: FormData): Promise<NewRoleState> {
  const transcript = String(form.get('transcript') || '').trim();
  const client_name = String(form.get('client_name') || '').trim();
  const client_email = String(form.get('client_email') || '').trim();
  if (transcript.length < 80) return { error: 'Paste the full call notes — a few sentences at least — so the job description has real facts to work from.' };
  const r = await callN8n('em-p3-jd', { transcript, client_name, client_email });
  if (!r.ok || !r.data?.ok) return { error: r.data?.error || `The automation did not answer (status ${r.status}). Check that the n8n workflows are active, then try again.` };
  return { ok: true, role_id: r.data.role_id, title: r.data.title, slack_error: r.data.slack_error };
}
