// "Lucía Fernández" == "Lucia Fernandez"; "Lina Al-Khoury" == "Lina Khoury"
export function nameKey(n: string): string {
  const t = String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/);
  if (!t.length || !t[0]) return '';
  return t[0] + ' ' + t[t.length - 1].replace(/^(al-|el-)/, '');
}
