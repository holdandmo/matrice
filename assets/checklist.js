// Listes de rangement : cycle soir → matin. Chaque coche garde le compte qui l'a faite.
// En mode édition (admin) : modifier, supprimer, déplacer, ajouter des points (effet : aujourd'hui et la suite).
import { sb, $, esc, fmt } from './core.js?v=6';
import { chip, GROUPS } from './photos.js?v=6';
import { isEditing, onEditChange, T } from './edit.js?v=6';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const META = {
  studios: { cls: 's', title: 'Studios A et B', chip: 'studios', chipTitle: 'Studios A, B et SAS' },
  playback: { cls: 'b', title: 'Playback Solutions', chip: 'bureau', chipTitle: 'Bureau Playback rangé' },
};
const C = { me: null, cycle: null, items: {}, checks: new Set(), note: '', busy: new Set() };

const expected = () => (C.cycle?.expected || []).filter((e) => C.items[e.item]);
function progress(ph) {
  const exp = expected().filter((e) => e.phase === ph);
  const nb = exp.filter((e) => C.checks.has(`${ph}|${e.item}`)).length;
  return { nb, tb: exp.length, done: nb === exp.length };
}
const box = (ph, id, label) => `<button class="ck" role="checkbox" aria-checked="${C.checks.has(`${ph}|${id}`)}" data-ck="${ph}|${id}" aria-label="${esc(label)} : ${ph}"${isEditing() ? ' disabled' : ''}>${TICK}</button>`;

function render() {
  if (!C.cycle) return;
  const ed = isEditing();
  const D = C.cycle.evening_date, M = C.cycle.morning_date;
  const sS = progress('soir'), sM = progress('matin');
  const todo = !sS.done ? 'À cocher ce soir en fermant' : !sM.done ? 'À cocher au matin en ouvrant' : 'Terminé';
  $('cycle').innerHTML = `<div class="when">Soir du ${fmt(D)} → matin du ${fmt(M)}<em>${todo}</em></div><div class="prog"><span class="${sS.done ? 'done' : ''}">Soir ${sS.nb}/${sS.tb}</span><span class="${sM.done ? 'done' : ''}">Matin ${sM.nb}/${sM.tb}</span></div>${C.note ? `<p class="note">${esc(C.note)}</p>` : ''}`;

  let html = '';
  for (const list of ['studios', 'playback']) {
    const meta = META[list];
    // en mode édition on montre tous les points actifs ; sinon ceux du cycle
    const ids = ed
      ? Object.values(C.items).filter((i) => i.list === list && i.active).sort((a, b) => a.position - b.position).map((i) => i.id)
      : [...new Set(expected().filter((e) => C.items[e.item].list === list).map((e) => e.item))].sort((a, b) => C.items[a].position - C.items[b].position);
    html += `<div class="std ${meta.cls}"><h3>${meta.title} <span>${chip(GROUPS[meta.chip], meta.chipTitle)}</span></h3>${T(`home.${list}.sub`, 'À faire le soir · à vérifier le matin', 'small')}<div class="hdr"><span></span><span>Soir</span><span>Matin</span></div><ul>`
      + ids.map((id, k) => {
        const it = C.items[id];
        const label = ed
          ? `<span class="lbl-ed" data-item="${id}" contenteditable="plaintext-only">${esc(it.label)}</span><span class="ed-tools">${k > 0 ? `<button type="button" class="ed-btn mv" data-mv="${id}|-1" title="Monter">↑</button>` : ''}${k < ids.length - 1 ? `<button type="button" class="ed-btn mv" data-mv="${id}|1" title="Descendre">↓</button>` : ''}<button type="button" class="ed-btn" data-rm="${id}" title="Supprimer ce point">×</button></span>`
          : esc(it.label);
        return `<li class="row"><span>${label}</span>${box('soir', id, it.label)}${box('matin', id, it.label)}</li>`;
      }).join('')
      + `</ul>${ed ? `<form class="ed-add" data-add="${list}"><input type="text" placeholder="Nouveau point à contrôler" aria-label="Nouveau point (${meta.title})" required><button type="submit">Ajouter</button></form><p class="ed-note">Les changements s’appliquent dès aujourd’hui et pour la suite.</p>` : ''}</div>`;
  }
  $('stds').innerHTML = html;
}

async function loadItems() {
  const { data } = await sb.from('studio_items').select('*').neq('list', 'tasks');
  C.items = {}; (data || []).forEach((i) => (C.items[i.id] = i));
}
async function loadCycle() {
  const { data, error } = await sb.rpc('studio_current_cycle');
  if (error || !data) { $('cycle').innerHTML = '<p class="note">Impossible de charger la liste. Recharger la page.</p>'; return; }
  C.cycle = data; await loadMarks();
}
async function loadMarks() {
  if (!C.cycle) return; const id = C.cycle.id;
  const { data } = await sb.from('studio_checks').select('phase,item_id').eq('cycle_id', id);
  if (id !== C.cycle.id) return;
  C.checks = new Set((data || []).map((r) => `${r.phase}|${r.item_id}`));
  render();
}
async function tryComplete() {
  const before = C.cycle.id;
  const { data, error } = await sb.rpc('studio_try_complete', { p_cycle: before });
  if (error || !data) return;
  if (data.id !== before) { C.cycle = data; C.note = 'Liste terminée et enregistrée. Nouvelle liste prête pour ce soir.'; await loadMarks(); }
}
async function toggle(key) {
  if (C.busy.has(key) || !C.cycle || isEditing()) return;
  const [phase, item_id] = key.split('|'); const cycle_id = C.cycle.id;
  C.busy.add(key); C.note = '';
  const on = C.checks.has(key);
  on ? C.checks.delete(key) : C.checks.add(key); render();
  const { error } = on ? await sb.from('studio_checks').delete().match({ cycle_id, phase, item_id }) : await sb.from('studio_checks').insert({ cycle_id, phase, item_id });
  C.busy.delete(key);
  if (error) { C.note = 'Enregistrement impossible, réessayer.'; await loadMarks(); return; }
  if (!on) await tryComplete();
}

// ---- édition des points
async function saveItem(id, patch) { const { error } = await sb.from('studio_items').update(patch).eq('id', id); if (!error) Object.assign(C.items[id], patch); return error; }
async function afterEdit() { await loadItems(); await loadCycle(); }
async function move(id, dir) {
  const it = C.items[id];
  const list = Object.values(C.items).filter((i) => i.list === it.list && i.active).sort((a, b) => a.position - b.position);
  const k = list.findIndex((i) => i.id === id), other = list[k + dir]; if (!other) return;
  // renumérote proprement puis échange
  list.forEach((i, n) => (i.position = n + 1));
  [list[k].position, other.position] = [other.position, list[k].position];
  for (const i of list) await sb.from('studio_items').update({ position: i.position }).eq('id', i.id);
  await afterEdit();
}

export async function initChecklist(me) {
  C.me = me;
  await loadItems();
  document.addEventListener('click', async (e) => {
    const ck = e.target.closest('.ck[data-ck]'); if (ck) { toggle(ck.dataset.ck); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { await saveItem(rm.dataset.rm, { active: false }); await afterEdit(); return; }
    const mv = e.target.closest('[data-mv]'); if (mv) { const [id, d] = mv.dataset.mv.split('|'); await move(id, +d); }
  });
  document.addEventListener('focusout', async (e) => {
    const el = e.target.closest?.('[data-item][contenteditable]'); if (!el) return;
    const id = el.dataset.item, label = el.textContent.trim();
    if (!label || label === C.items[id]?.label) { el.textContent = C.items[id]?.label || ''; return; }
    await saveItem(id, { label });
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-add]'); if (!f) return; e.preventDefault();
    const list = f.dataset.add, label = f.querySelector('input').value.trim(); if (!label) return;
    const pos = Math.max(0, ...Object.values(C.items).filter((i) => i.list === list).map((i) => i.position)) + 1;
    const id = `${list === 'studios' ? 's' : 'b'}-${Date.now().toString(36)}`;
    const { error } = await sb.from('studio_items').insert({ id, list, label, phases: ['soir', 'matin'], position: pos });
    if (error) { C.note = 'Ajout impossible.'; render(); return; }
    await afterEdit();
  });
  onEditChange(render);
  await loadCycle();
  let t = null; const refresh = () => { clearTimeout(t); t = setTimeout(async () => { await loadItems(); await loadCycle(); }, 300); };
  sb.channel('studio')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_checks' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_cycles' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_items' }, refresh)
    .subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return { rerender: render };
}
