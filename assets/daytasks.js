// Tâches du jour (jour calendaire) : une case par tâche, le compte qui coche est enregistré.
// En mode édition (admin) : modifier, supprimer, ajouter (jours et moment). Effet : aujourd'hui et la suite.
import { sb, $, esc, fmt } from './core.js?v=7';
import { chip } from './photos.js?v=7';
import { isEditing, onEditChange } from './edit.js?v=7';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const D = { day: null, items: {}, checks: new Set(), busy: new Set(), err: '' };
const when = (it) => (it.moment === 'matin' ? 'Le matin' : 'Dans la journée');
const daysTxt = (w) => (w || []).sort().map((d) => DAYS[d - 1]).join(' · ');

function render() {
  const el = $('today'); if (!D.day) return;
  const ed = isEditing();
  if (ed) {
    const all = Object.values(D.items).filter((i) => i.active).sort((a, b) => (a.moment === b.moment ? a.position - b.position : a.moment === 'matin' ? -1 : 1));
    el.innerHTML = `<div class="today-h"><b>Tâches du jour</b><span>toutes les tâches de la semaine</span></div><ul class="today-list">`
      + all.map((it) => `<li><span></span><span class="lbl"><span class="lbl-ed" data-task="${it.id}" contenteditable="plaintext-only">${esc(it.label)}</span><button type="button" class="ed-btn" data-trm="${it.id}" title="Supprimer cette tâche">×</button><button type="button" class="ed-btn ph-add" data-addph="item|${it.id}" data-label="${esc(it.label)}" data-slots="${(it.photo_slots || []).join(',')}" title="Ajouter une photo">📷+</button>${it.photo_slots?.length ? chip(it.photo_slots, it.label) : ''}</span><span class="when">${when(it)} · ${daysTxt(it.weekdays)}</span></li>`).join('')
      + `</ul><form class="ed-add" id="task-add"><input type="text" placeholder="Nouvelle tâche" aria-label="Nouvelle tâche" required><select aria-label="Moment"><option value="matin">Le matin</option><option value="journee">Dans la journée</option></select><span class="days">${DAYS.slice(0, 5).map((d, i) => `<label><input type="checkbox" value="${i + 1}">${d}</label>`).join('')}</span><button type="submit">Ajouter</button></form><p class="ed-note">Les changements s’appliquent dès aujourd’hui et pour la suite.</p>`;
    return;
  }
  const ids = (D.day.expected || []).filter((i) => D.items[i]);
  if (!ids.length) { el.innerHTML = `<div class="today-h"><b>Tâches du jour</b><span class="date">${fmt(D.day.day)}</span></div><p class="today-none">Pas de tâche particulière aujourd’hui.</p>`; return; }
  const done = ids.filter((i) => D.checks.has(i)).length;
  el.innerHTML = `<div class="today-h"><b>Tâches du jour</b><span class="date">${fmt(D.day.day)}</span><em>${done}/${ids.length}</em></div><ul class="today-list">`
    + ids.map((id) => {
      const it = D.items[id], c = D.checks.has(id);
      return `<li class="${c ? 'done' : ''}"><button class="ck tk" role="checkbox" aria-checked="${c}" data-tk="${id}" aria-label="${esc(it.label)}">${TICK}</button><span class="lbl">${esc(it.label)}${it.photo_slots?.length ? chip(it.photo_slots, it.label) : ''}</span><span class="when">${when(it)}</span></li>`;
    }).join('') + `</ul>${D.err ? `<p class="note">${esc(D.err)}</p>` : ''}`;
}
async function loadItems() {
  const { data } = await sb.from('studio_items').select('*').eq('list', 'tasks');
  D.items = {}; (data || []).forEach((i) => (D.items[i.id] = i));
}
async function load() {
  const { data } = await sb.rpc('studio_today'); if (!data) return;
  D.day = data;
  const { data: k } = await sb.from('studio_day_checks').select('item_id').eq('day', data.day);
  D.checks = new Set((k || []).map((r) => r.item_id));
  render();
}
async function toggle(id) {
  if (D.busy.has(id) || !D.day || isEditing()) return; D.busy.add(id); D.err = '';
  const on = D.checks.has(id);
  on ? D.checks.delete(id) : D.checks.add(id); render();
  const { error } = on ? await sb.from('studio_day_checks').delete().match({ day: D.day.day, item_id: id }) : await sb.from('studio_day_checks').insert({ day: D.day.day, item_id: id });
  D.busy.delete(id);
  if (error) { D.err = 'Enregistrement impossible, réessayer.'; await load(); }
}
export async function initDayTasks() {
  await loadItems();
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tk]'); if (b) { e.stopPropagation(); toggle(b.dataset.tk); return; }
    const rm = e.target.closest('[data-trm]');
    if (rm) { await sb.from('studio_items').update({ active: false }).eq('id', rm.dataset.trm); await loadItems(); await load(); }
  }, true);
  document.addEventListener('focusout', async (e) => {
    const el = e.target.closest?.('[data-task][contenteditable]'); if (!el) return;
    const id = el.dataset.task, label = el.textContent.trim();
    if (!label || label === D.items[id]?.label) { el.textContent = D.items[id]?.label || ''; return; }
    const { error } = await sb.from('studio_items').update({ label }).eq('id', id);
    if (!error) D.items[id].label = label;
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'task-add') return; e.preventDefault();
    const f = e.target, label = f.querySelector('input[type=text]').value.trim(), moment = f.querySelector('select').value;
    const weekdays = [...f.querySelectorAll('.days input:checked')].map((x) => +x.value);
    if (!label || !weekdays.length) { D.err = 'Indiquer au moins un jour.'; return; }
    const pos = Math.max(0, ...Object.values(D.items).map((i) => i.position)) + 1;
    const { error } = await sb.from('studio_items').insert({ id: `t-${Date.now().toString(36)}`, list: 'tasks', label, moment, phases: [moment], weekdays, position: pos });
    if (!error) { await loadItems(); await load(); }
  });
  onEditChange(render);
  document.addEventListener('slotadded', (e) => { const { kind, id, slots } = e.detail; if (kind === 'item' && D.items[id]) { D.items[id].photo_slots = slots; render(); } });
  await load();
  sb.channel('daytasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_day_checks' }, () => load())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_days' }, () => load())
    .subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  return { rerender: render };
}
