'use server';
import { revalidatePath } from 'next/cache';
import { callN8n } from '@/lib/n8n';

export type RebuildState = { ok?: boolean; error?: string; matches?: number };

// Re-runs the top-5 search for an open role and posts the new shortlist to Slack (workflow EM-P3 07).
export async function rebuildShortlist(_: RebuildState, form: FormData): Promise<RebuildState> {
  const role_id = String(form.get('role_id') || '');
  const r = await callN8n('em-p3-shortlist', { role_id }, 280_000);
  revalidatePath(`/roles/${role_id}`);
  if (!r.ok || !r.data?.ok) return { error: r.data?.error || `The automation did not answer (status ${r.status}).` };
  return { ok: true, matches: r.data.matches || 0 };
}
