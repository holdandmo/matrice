import { sb, $, esc, fmtS, requireMember } from '../core.js?v=5';

await requireMember();
const H = { days: 30, open: new Set(), rows: [] };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function load() {
  const since = new Date(); since.setDate(since.getDate() - H.days);
  const { data, error } = await sb.from('studio_history_items').select('*').neq('status', 'open').gte('evening_date', iso(since)).order('evening_date', { ascending: false });
  if (error) { $('hist').innerHTML = '<p class="empty">Impossible de charger l’historique.</p>'; return; }
  const map = new Map();
  for (const r of data || []) {
    if (!map.has(r.cycle_id)) map.set(r.cycle_id, { id: r.cycle_id, date: r.evening_date, morning: r.morning_date, status: r.status, rows: [] });
    map.get(r.cycle_id).rows.push(r);
  }
  H.rows = [...map.values()]; render();
}
function cell(h, ph, list) {
  const rows = h.rows.filter((r) => r.phase === ph && r.list === list); if (!rows.length) return '<td>—</td>';
  const ok = rows.filter((r) => r.checked).length, who = rows[0].signed_by;
  return `<td><span class="${ok < rows.length ? 'miss' : ''}">${ok}/${rows.length}</span> · ${who ? esc(who) : '<span class="miss">sans nom</span>'}</td>`;
}
function render() {
  const intro = '<p class="lead-top">Chaque liste, cochée ou non, avec le nom de la personne. Cliquer sur une ligne pour voir le détail.</p>';
  if (!H.rows.length) { $('hist').innerHTML = intro + `<p class="empty">Aucune liste clôturée sur les ${H.days} derniers jours.</p><button class="more" id="more">Afficher 30 jours de plus</button>`; return; }
  $('hist').innerHTML = intro + `<div class="wrap"><table><thead><tr><th>Soir → matin</th><th>Statut</th><th>Studios soir</th><th>Studios matin</th><th>Playback soir</th><th>Playback matin</th><th>Tâches</th></tr></thead><tbody>`
    + H.rows.map((h) => {
      const t = h.rows.filter((r) => r.list === 'tasks'); const tOk = t.filter((r) => r.checked).length;
      const tWho = [...new Set(t.map((r) => r.signed_by).filter(Boolean))].join(' / ');
      const miss = h.rows.filter((r) => !r.checked); const open = H.open.has(h.id);
      return `<tr class="sum" data-h="${h.id}" tabindex="0"><td>${fmtS(h.date)} → ${fmtS(h.morning)}</td><td><span class="st ${h.status}">${h.status === 'done' ? 'Terminé' : 'Incomplet'}</span></td>${cell(h, 'soir', 'studios')}${cell(h, 'matin', 'studios')}${cell(h, 'soir', 'playback')}${cell(h, 'matin', 'playback')}<td>${t.length ? `<span class="${tOk < t.length ? 'miss' : ''}">${tOk}/${t.length}</span>${tWho ? ' · ' + esc(tWho) : ''}` : '—'}</td></tr>`
        + (open ? `<tr class="det"><td colspan="7">${miss.length ? '<b>Non coché :</b> ' + miss.map((r) => `${r.phase} · ${esc(r.label)}`).join(' ; ') : '<b>Tout a été coché.</b>'}</td></tr>` : '');
    }).join('') + '</tbody></table></div><button class="more" id="more">Afficher 30 jours de plus</button>';
}
document.addEventListener('click', (e) => {
  const h = e.target.closest('tr.sum'); if (h) { H.open.has(h.dataset.h) ? H.open.delete(h.dataset.h) : H.open.add(h.dataset.h); render(); return; }
  if (e.target.closest('#more')) { H.days += 30; load(); loadDays(); }
});
document.addEventListener('keydown', (e) => { const h = e.target.closest?.('tr.sum'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.click(); } });
load();
loadDays();

// ---- tâches du jour : faites ou non
async function loadDays() {
  const since = new Date(); since.setDate(since.getDate() - H.days);
  const { data, error } = await sb.from('studio_day_history').select('*').gte('day', iso(since)).order('day', { ascending: false });
  const el = $('hist-days');
  const head = '<div class="section-h"><h2>Tâches du jour</h2><p>Poubelles, recyclage, désodorisant, courses : fait ou non, et par qui.</p></div>';
  if (error) { el.innerHTML = head + '<p class="empty">Impossible de charger les tâches du jour.</p>'; return; }
  const days = new Map();
  for (const r of data || []) { if (!days.has(r.day)) days.set(r.day, []); days.get(r.day).push(r); }
  if (!days.size) { el.innerHTML = head + `<p class="empty">Aucune tâche du jour sur les ${H.days} derniers jours.</p>`; return; }
  const hm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = head + '<div class="wrap"><table><thead><tr><th>Jour</th><th>Tâche</th><th>Fait</th></tr></thead><tbody>'
    + [...days.entries()].map(([d, rows]) => rows.map((r, i) => `<tr>${i === 0 ? `<td rowspan="${rows.length}">${fmtS(d)}</td>` : ''}<td>${esc(r.label)}</td><td>${r.checked ? `${esc(r.checked_by || '')} · ${hm(r.checked_at)}` : '<span class="miss">Non fait</span>'}</td></tr>`).join('')).join('')
    + '</tbody></table></div>';
}
