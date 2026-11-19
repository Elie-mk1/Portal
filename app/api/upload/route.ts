import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { callN8n } from '@/lib/n8n';

export const maxDuration = 300;
const MAX = 4 * 1024 * 1024;

// 1 file per request: store it privately, record it, then ask n8n to read it. Returns what happened.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'No file received' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, message: 'File is larger than 4 MB — please compress it and upload again' }, { status: 413 });
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
  const s = db();
  const up = await s.storage.from('cvs').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream', upsert: false });
  if (up.error) return NextResponse.json({ ok: false, message: 'Could not store the file: ' + up.error.message }, { status: 500 });
  const ins = await s.from('rc_cv_files').insert({ file_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, status: 'queued' }).select('id').single();
  if (ins.error) return NextResponse.json({ ok: false, message: 'Could not record the file: ' + ins.error.message }, { status: 500 });
  const r = await callN8n('em-p3-cv-ingest', { file_id: ins.data.id }, 280_000);
  if (!r.ok) {
    await s.from('rc_cv_files').update({ status: 'error', status_reason: 'Reading failed: ' + (r.data?.message || r.data?.error || `status ${r.status}`) + ' — upload again' }).eq('id', ins.data.id);
    return NextResponse.json({ ok: false, file_id: ins.data.id, message: 'The automation could not read this file (' + (r.data?.message || r.data?.error || r.status) + '). It is listed under Needs attention.' }, { status: 502 });
  }
  return NextResponse.json({ ...r.data, file_id: ins.data.id });
}
