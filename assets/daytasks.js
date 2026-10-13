// Tâches du jour (calendrier) : une case par tâche, le nom est enregistré automatiquement.
import { sb, $, esc, fmt } from './core.js?v=5';
import { chip } from './photos.js?v=5';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const D = { me: null, day: null, items: {}, names: {}, checks: new Map(), busy: new Set(), err: '' };
const hm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function render() {
  const el = $('today'); if (!D.day) return;
  const ids = (D.day.expected || []).filter((i) => D.items[i]);
  if (!ids.length) { el.innerHTML = `<div class="today-h"><b>Tâches du jour</b><span>${fmt(D.day.day)}</span></div><p class="today-none">Pas de tâche particulière aujourd’hui.</p>`; return; }
  const done = ids.filter((i) => D.checks.has(i)).length;
  el.innerHTML = `<div class="today-h"><b>Tâches du jour</b><span>${fmt(D.day.day)}</span><em>${done}/${ids.length}</em></div><ul class="today-list">`
    + ids.map((id) => {
      const it = D.items[id], c = D.checks.get(id);
      return `<li class="${c ? 'done' : ''}"><button class="ck tk" role="checkbox" aria-checked="${!!c}" data-tk="${id}" aria-label="${esc(it.label)}">${TICK}</button><span class="lbl">${esc(it.label)}${it.photo_slots?.length ? chip(it.photo_slots, it.label) : ''}</span><span class="when">${it.moment === 'matin' ? 'Le matin' : 'Dans la journée'}</span><span class="by">${c ? `${esc(D.names[c.by] || '')} · ${hm(c.at)}` : ''}</span></li>`;
    }).join('') + `</ul>${D.err ? `<p class="note">${esc(D.err)}</p>` : ''}`;
}
async function load() {
  const { data } = await sb.rpc('studio_today'); if (!data) return;
  D.day = data;
  const { data: k } = await sb.from('studio_day_checks').select('item_id,checked_by,checked_at').eq('day', data.day);
  D.checks = new Map((k || []).map((r) => [r.item_id, { by: r.checked_by, at: r.checked_at }]));
  render();
}
async function toggle(id) {
  if (D.busy.has(id) || !D.day) return; D.busy.add(id); D.err = '';
  const on = D.checks.has(id);
  if (on) D.checks.delete(id); else D.checks.set(id, { by: D.me.id, at: new Date().toISOString() });
  render();
  const { error } = on ? await sb.from('studio_day_checks').delete().match({ day: D.day.day, item_id: id }) : await sb.from('studio_day_checks').insert({ day: D.day.day, item_id: id });
  D.busy.delete(id);
  if (error) { D.err = 'Enregistrement impossible, réessayer.'; await load(); }
}
export async function initDayTasks(me) {
  D.me = me;
  const [items, team] = await Promise.all([sb.from('studio_items').select('*').eq('list', 'tasks'), sb.rpc('team_names')]);
  (items.data || []).forEach((i) => (D.items[i.id] = i));
  (team.data || []).forEach((m) => (D.names[m.id] = m.name));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-tk]'); if (b) { e.stopPropagation(); toggle(b.dataset.tk); } }, true);
  await load();
  sb.channel('daytasks').on('postgres_changes', { event: '*', schema: 'public', table: 'studio_day_checks' }, () => load()).subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  return { rerender: render };
}
