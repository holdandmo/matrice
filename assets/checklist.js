// Liste du jour : cycle soir → matin, cases, « Fait par », tâches de la semaine.
import { sb, $, esc, fmt, fmtDT } from './core.js';
import { chip, GROUPS } from './photos.js';

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const META = {
  studios: { cls: 's', title: 'Studios A et B', chip: 'studios', chipTitle: 'Studios A, B et SAS' },
  playback: { cls: 'b', title: 'Playback Solutions', chip: 'bureau', chipTitle: 'Bureau Playback rangé' },
  tasks: { cls: 't', title: 'Tâches du jour' },
};
const C = { me: null, cycle: null, items: {}, team: [], names: {}, checks: new Map(), signs: {}, note: '', busy: new Set() };

const expected = () => (C.cycle?.expected || []).filter((e) => C.items[e.item]);
function progress(ph) {
  const exp = expected().filter((e) => e.phase === ph);
  const lists = [...new Set(exp.map((e) => C.items[e.item].list))];
  const nb = exp.filter((e) => C.checks.has(`${ph}|${e.item}`)).length;
  const ns = lists.filter((l) => C.signs[`${ph}|${l}`]).length;
  return { nb, tb: exp.length, ns, ts: lists.length, done: nb === exp.length && ns === lists.length };
}
function box(ph, id, label) {
  const c = C.checks.get(`${ph}|${id}`);
  const tip = c ? ` title="Coché${c.by && C.names[c.by] ? ' par ' + esc(C.names[c.by]) : ''} · ${fmtDT(c.at)}"` : '';
  return `<button class="ck" role="checkbox" aria-checked="${!!c}" data-ck="${ph}|${id}" aria-label="${esc(label)} : ${ph}"${tip}>${TICK}</button>`;
}
function signSel(ph, list) {
  const v = C.signs[`${ph}|${list}`] || '';
  return `<label>${ph === 'soir' ? 'Soir' : 'Matin'} <select data-sign="${ph}|${list}" class="${v ? 'ok' : 'need'}" aria-label="Fait par (${ph})"><option value="">Fait par…</option>${C.team.map((m) => `<option value="${m.id}"${m.id === v ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`;
}
function render() {
  if (!C.cycle) return;
  const D = C.cycle.evening_date, M = C.cycle.morning_date;
  const sS = progress('soir'), sM = progress('matin');
  const todo = !sS.done ? (sS.nb < sS.tb ? 'À cocher ce soir en fermant' : 'Indiquer qui a fait la fermeture') : !sM.done ? (sM.nb < sM.tb ? 'À cocher au matin en ouvrant' : 'Indiquer qui a fait l’ouverture') : 'Terminé';
  $('cycle').innerHTML = `<div class="when">Soir du ${fmt(D)} → matin du ${fmt(M)}<em>${todo}</em></div><div class="prog"><span class="${sS.done ? 'done' : ''}">Soir ${sS.nb}/${sS.tb}</span><span class="${sM.done ? 'done' : ''}">Matin ${sM.nb}/${sM.tb}</span></div>${C.note ? `<p class="note">${esc(C.note)}</p>` : ''}`;
  const exp = expected();
  const byList = { studios: [], playback: [], tasks: [] };
  for (const e of exp) { const it = C.items[e.item]; if (!byList[it.list].includes(it)) byList[it.list].push(it); }
  let html = '';
  for (const list of ['tasks', 'studios', 'playback']) {
    const items = byList[list].sort((a, b) => a.position - b.position); if (!items.length) continue;
    const meta = META[list];
    const phs = ['soir', 'matin'].filter((ph) => exp.some((e) => e.phase === ph && C.items[e.item].list === list));
    const has = (ph, id) => exp.some((e) => e.phase === ph && e.item === id);
    const sub = list === 'tasks' ? `<small>${phs.map((ph) => (ph === 'soir' ? fmt(D) + ' (soir)' : fmt(M) + ' (matin)')).join(' · ')}</small>` : '<small>À faire à la fermeture · à vérifier à l’ouverture</small>';
    html += `<div class="std ${meta.cls}"><h3>${meta.title}${meta.chip ? ` <span>${chip(GROUPS[meta.chip], meta.chipTitle)}</span>` : ''}</h3>${sub}<div class="hdr"><span>${list === 'tasks' ? 'Tâche' : 'Point à contrôler'}</span><span>Soir</span><span>Matin</span></div><ul>`
      + items.map((it) => `<li class="row"><span>${esc(it.label)}${it.photo_slots?.length ? chip(it.photo_slots, it.label) : ''}${it.hint ? `<span class="tag">${esc(it.hint)}</span>` : ''}</span>${has('soir', it.id) ? box('soir', it.id, it.label) : '<span class="blank">—</span>'}${has('matin', it.id) ? box('matin', it.id, it.label) : '<span class="blank">—</span>'}</li>`).join('')
      + `</ul><div class="signs">${phs.map((ph) => signSel(ph, list)).join('')}</div></div>`;
  }
  $('stds').innerHTML = html;
}

async function loadCycle() {
  const { data, error } = await sb.rpc('studio_current_cycle');
  if (error || !data) { C.note = 'Impossible de charger la liste du jour. Recharger la page.'; $('cycle').innerHTML = `<p class="note">${C.note}</p>`; return; }
  C.cycle = data; await loadMarks();
}
async function loadMarks() {
  if (!C.cycle) return; const id = C.cycle.id;
  const [k, s] = await Promise.all([
    sb.from('studio_checks').select('phase,item_id,checked_by,checked_at').eq('cycle_id', id),
    sb.from('studio_signs').select('phase,list,member_id').eq('cycle_id', id),
  ]);
  if (id !== C.cycle.id) return;
  C.checks = new Map((k.data || []).map((r) => [`${r.phase}|${r.item_id}`, { by: r.checked_by, at: r.checked_at }]));
  C.signs = {}; (s.data || []).forEach((r) => (C.signs[`${r.phase}|${r.list}`] = r.member_id));
  render();
}
async function tryComplete() {
  const before = C.cycle.id;
  const { data, error } = await sb.rpc('studio_try_complete', { p_cycle: before });
  if (error || !data) return;
  if (data.id !== before) { C.cycle = data; C.note = 'Liste terminée et enregistrée dans l’historique. Nouvelle liste prête pour ce soir.'; await loadMarks(); }
}
async function setSign(key, member) {
  const [phase, list] = key.split('|'); const cycle_id = C.cycle.id;
  if (member) C.signs[key] = member; else delete C.signs[key];
  const { error } = member
    ? await sb.from('studio_signs').upsert({ cycle_id, phase, list, member_id: member, signed_at: new Date().toISOString() })
    : await sb.from('studio_signs').delete().match({ cycle_id, phase, list });
  return error;
}
async function toggle(key) {
  if (C.busy.has(key) || !C.cycle) return;
  const [phase, item_id] = key.split('|'); const cycle_id = C.cycle.id; const list = C.items[item_id].list;
  C.busy.add(key); C.note = '';
  const on = C.checks.has(key);
  if (on) C.checks.delete(key); else C.checks.set(key, { by: C.me.id, at: new Date().toISOString() });
  // la première coche d'une liste met automatiquement le nom de la personne connectée
  const autoSign = !on && !C.signs[`${phase}|${list}`];
  if (autoSign) C.signs[`${phase}|${list}`] = C.me.id;
  render();
  const { error } = on ? await sb.from('studio_checks').delete().match({ cycle_id, phase, item_id }) : await sb.from('studio_checks').insert({ cycle_id, phase, item_id });
  if (!error && autoSign) await setSign(`${phase}|${list}`, C.me.id);
  C.busy.delete(key);
  if (error) { C.note = 'Enregistrement impossible, réessayer.'; await loadMarks(); return; }
  if (!on) await tryComplete();
}

export async function initChecklist(me) {
  C.me = me;
  const [items, team] = await Promise.all([sb.from('studio_items').select('*').eq('active', true), sb.rpc('team_names')]);
  (items.data || []).forEach((i) => (C.items[i.id] = i));
  C.team = team.data || []; C.team.forEach((m) => (C.names[m.id] = m.name));
  document.addEventListener('click', (e) => { const ck = e.target.closest('.ck'); if (ck) toggle(ck.dataset.ck); });
  document.addEventListener('change', async (e) => {
    const s = e.target.closest('select[data-sign]'); if (!s || !C.cycle) return;
    C.note = ''; render();
    const err = await setSign(s.dataset.sign, s.value);
    if (err) { C.note = 'Enregistrement du nom impossible, réessayer.'; await loadMarks(); return; }
    render(); if (s.value) await tryComplete();
  });
  await loadCycle();
  let t = null; const refresh = () => { clearTimeout(t); t = setTimeout(loadCycle, 300); };
  sb.channel('studio')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_checks' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_signs' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_cycles' }, refresh)
    .subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return { rerender: render };
}
