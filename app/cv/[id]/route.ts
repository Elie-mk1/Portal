import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

// Opens a CV file through a short-lived signed link (the storage bucket is private).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });
  const { data: f } = await db().from('rc_cv_files').select('storage_path,file_name').eq('id', id).maybeSingle();
  if (!f?.storage_path) return new NextResponse('This CV file was not found.', { status: 404 });
  const { data, error } = await db().storage.from('cvs').createSignedUrl(f.storage_path, 120, { download: false });
  if (error || !data) return new NextResponse('Could not open the file: ' + (error?.message || 'unknown error'), { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
