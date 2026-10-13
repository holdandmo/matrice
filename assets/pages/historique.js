// Historique (administrateur) : qui a coché quoi, quel jour ; tâches du jour ; journal des coches et décoches.
import { sb, $, esc, fmtS, fmtDT, requireMember } from '../core.js?v=6';

const { isAdmin } = await requireMember();
if (!isAdmin) { $('hist').innerHTML = '<p class="empty">Cette page est réservée à l’administrateur.</p>'; throw new Error('admin'); }

const H = { days: 14, open: new Set(), cycles: [], tasks: [], log: [], onlyUndo: false };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const LIST = { studios: 'Studios', playback: 'Playback' };

async function load() {
  const since = new Date(); since.setDate(since.getDate() - H.days); const s = iso(since);
  const [c, t, l] = await Promise.all([
    sb.from('studio_history_items').select('*').gte('evening_date', s).order('evening_date', { ascending: false }),
    sb.from('studio_day_history').select('*').gte('day', s).order('day', { ascending: false }),
    sb.from('check_log_view').select('*').gte('day', s).order('at', { ascending: false }).limit(500),
  ]);
  const map = new Map();
  for (const r of c.data || []) {
    if (r.list === 'tasks') continue;
    if (!map.has(r.cycle_id)) map.set(r.cycle_id, { id: r.cycle_id, date: r.evening_date, morning: r.morning_date, status: r.status, rows: [] });
    map.get(r.cycle_id).rows.push(r);
  }
  H.cycles = [...map.values()]; H.tasks = t.data || []; H.log = l.data || [];
  render();
}
function who(rows) { const w = [...new Set(rows.filter((r) => r.checked).map((r) => r.checked_by).filter(Boolean))]; return w.length ? w.map(esc).join(', ') : '—'; }
function cell(h, ph, list) {
  const rows = h.rows.filter((r) => r.phase === ph && r.list === list); if (!rows.length) return '<td>—</td>';
  const ok = rows.filter((r) => r.checked).length;
  return `<td><span class="${ok < rows.length ? 'miss' : 'yes'}">${ok}/${rows.length}</span> · ${who(rows)}</td>`;
}
function render() {
  const st = { open: 'En cours', done: 'Terminé', incomplete: 'Incomplet' };
  const cyc = H.cycles.length
    ? `<div class="wrap"><table><thead><tr><th>Soir → matin</th><th>Statut</th><th>Studios soir</th><th>Studios matin</th><th>Playback soir</th><th>Playback matin</th></tr></thead><tbody>`
      + H.cycles.map((h) => {
        const open = H.open.has(h.id);
        return `<tr class="sum" data-h="${h.id}" tabindex="0"><td>${fmtS(h.date)} → ${fmtS(h.morning)}</td><td><span class="st ${h.status}">${st[h.status]}</span></td>${cell(h, 'soir', 'studios')}${cell(h, 'matin', 'studios')}${cell(h, 'soir', 'playback')}${cell(h, 'matin', 'playback')}</tr>`
          + (open ? `<tr class="det"><td colspan="6"><table class="mini"><tbody>${h.rows.map((r) => `<tr><td>${r.phase === 'soir' ? 'Soir' : 'Matin'} · ${LIST[r.list]}</td><td>${esc(r.label)}</td><td>${r.checked ? `${esc(r.checked_by || '?')} · ${hm(r.checked_at)}` : '<span class="miss">Non coché</span>'}</td></tr>`).join('')}</tbody></table></td></tr>` : '');
      }).join('') + '</tbody></table></div>'
    : '<p class="empty">Rien sur la période.</p>';

  const days = new Map(); for (const r of H.tasks) { if (!days.has(r.day)) days.set(r.day, []); days.get(r.day).push(r); }
  const tasks = days.size
    ? '<div class="wrap"><table><thead><tr><th>Jour</th><th>Tâche</th><th>Fait par</th></tr></thead><tbody>'
      + [...days.entries()].map(([d, rows]) => rows.map((r, i) => `<tr>${i === 0 ? `<td rowspan="${rows.length}">${fmtS(d)}</td>` : ''}<td>${esc(r.label)}</td><td>${r.checked ? `${esc(r.checked_by || '?')} · ${hm(r.checked_at)}` : '<span class="miss">Non fait</span>'}</td></tr>`).join('')).join('')
      + '</tbody></table></div>'
    : '<p class="empty">Rien sur la période.</p>';

  const log = H.log.filter((r) => !H.onlyUndo || r.action === 'décoché');
  const undo = H.log.filter((r) => r.action === 'décoché').length;
  const journal = `<label class="filter"><input type="checkbox" id="only-undo"${H.onlyUndo ? ' checked' : ''}> Seulement les décoches (${undo})</label>`
    + (log.length ? `<div class="wrap"><table><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Quoi</th></tr></thead><tbody>${log.map((r) => `<tr class="${r.action === 'décoché' ? 'undo' : ''}"><td>${fmtDT(r.at)}</td><td>${esc(r.who || '?')}</td><td>${r.action === 'décoché' ? '<span class="miss">Décoché</span>' : 'Coché'}</td><td>${esc(r.label || r.item_id)}<small> · ${r.kind === 'tâche' ? 'tâche du ' + fmtS(r.day) : (r.phase === 'soir' ? 'soir du ' : 'matin du ') + fmtS(r.day)}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Rien sur la période.</p>');

  $('hist').innerHTML = `<div class="section-h"><h2>Listes de rangement</h2><p>Cliquer sur une ligne pour le détail.</p></div>${cyc}
    <div class="section-h"><h2>Tâches du jour</h2></div>${tasks}
    <div class="section-h"><h2>Journal des coches</h2><p>Chaque coche et chaque décoche, avec le compte et l’heure.</p></div>${journal}
    <button class="more" id="more">Afficher 14 jours de plus</button>`;
}
document.addEventListener('click', (e) => {
  const h = e.target.closest('tr.sum'); if (h) { H.open.has(h.dataset.h) ? H.open.delete(h.dataset.h) : H.open.add(h.dataset.h); render(); return; }
  if (e.target.closest('#more')) { H.days += 14; load(); }
});
document.addEventListener('change', (e) => { if (e.target.id === 'only-undo') { H.onlyUndo = e.target.checked; render(); } });
document.addEventListener('keydown', (e) => { const h = e.target.closest?.('tr.sum'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.click(); } });
load();
