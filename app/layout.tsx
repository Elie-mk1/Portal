import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';

export const metadata: Metadata = { title: 'EM Recruiting Copilot', description: 'Recruiter portal: roles, shortlists, pipeline and CVs' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="rail">
            <Link href="/" className="brand">EM Recruiting Copilot<span>RemoteBridge Staffing</span></Link>
            <Nav />
            <div className="foot">Approvals happen in Slack. This portal shows where everything stands.</div>
          </aside>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
