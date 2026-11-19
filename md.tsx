import React from 'react';
// Renders the simple markdown the JD workflow produces (#, ##, - lists, **bold**). No HTML injection.
function inline(t: string, key: string) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={key + i}>{p.slice(2, -2)}</strong> : <React.Fragment key={key + i}>{p}</React.Fragment>));
}
export function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => { if (list.length) { out.push(<ul key={'u' + k}>{list.map((l, i) => <li key={i}>{inline(l, 'l' + k + i)}</li>)}</ul>); list = []; } };
  String(text || '').split('\n').forEach((line, i) => {
    if (line.startsWith('- ')) { list.push(line.slice(2)); return; }
    flush(i);
    if (line.startsWith('# ')) out.push(<h2 key={i}>{inline(line.slice(2), 'h' + i)}</h2>);
    else if (line.startsWith('## ')) out.push(<h3 key={i}>{inline(line.slice(3), 'h' + i)}</h3>);
    else if (line.trim()) out.push(<p key={i}>{inline(line, 'p' + i)}</p>);
  });
  flush(9999);
  return <div className="prose">{out}</div>;
}
