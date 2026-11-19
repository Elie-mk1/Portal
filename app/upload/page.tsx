import Uploader from './Uploader';
export default function UploadPage() {
  return (
    <div className="stack" style={{ maxWidth: 940 }}>
      <div className="page-head"><div><h1>Upload CVs</h1>
        <p className="muted">PDF, Word (.docx), JPG or PNG — scans and phone photos too. Each file is read, checked for duplicates and made searchable. Anything unreadable is flagged, never skipped.</p></div></div>
      <Uploader />
    </div>
  );
}
