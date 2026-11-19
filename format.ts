export function when(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export const ROLE_STATUS: Record<string, { label: string; tone: string }> = {
  drafting: { label: 'Writing JD', tone: 'muted' },
  pending_approval: { label: 'Waiting for your approval in Slack', tone: 'amber' },
  changes_requested: { label: 'Changes requested', tone: 'amber' },
  open: { label: 'Open', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'brick' },
  closed: { label: 'Closed', tone: 'muted' },
};
export const SHORTLIST_STATUS: Record<string, { label: string; tone: string }> = {
  suggested: { label: 'Waiting for approval', tone: 'amber' },
  approving: { label: 'Adding to GHL…', tone: 'muted' },
  approved: { label: 'Approved', tone: 'green' },
  skipped: { label: 'Skipped', tone: 'muted' },
  error: { label: 'Failed — approve again', tone: 'brick' },
};
export const OUTREACH_STATUS: Record<string, string> = {
  active: 'Emails in progress', replied: 'Replied', no_response: 'No response after 3 emails', stopped: 'Stopped', error: 'Error',
};
export const FILE_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: 'Queued', tone: 'muted' },
  processing: { label: 'Reading…', tone: 'muted' },
  active: { label: 'Current CV', tone: 'green' },
  superseded: { label: 'Replaced by newer CV', tone: 'muted' },
  duplicate: { label: 'Duplicate', tone: 'muted' },
  unreadable: { label: 'Unreadable', tone: 'brick' },
  error: { label: 'Failed', tone: 'brick' },
};
