// Contenu de l'Internal process : étapes d'ouverture et de fermeture (table process_steps), infos clés, planning.
import { sb, esc } from './core.js?v=7';
import { chip, GROUPS } from './photos.js?v=7';
import { isEditing, T } from './edit.js?v=7';

// ---- infos sensibles chargées après connexion (code de la porte…)
let INFO = null;
async function info() {
  if (!INFO) { const { data } = await sb.from('studio_info').select('key,value'); INFO = Object.fromEntries((data || []).map((r) => [r.key, r.value])); }
  return INFO;
}
export async function fillInfo(root = document) {
  const I = await info();
  root.querySelectorAll('[data-info]').forEach((el) => { if (I[el.dataset.info]) el.textContent = I[el.dataset.info]; });
}

export function keysHTML() {
  const b = isEditing() ? 'div' : 'button';
  return `
  <div class="keys">
    <${b} class="key link" data-ids="code" data-title="Boîtier à code de la porte principale"><span class="eyebrow">${T('keys.code.t', 'Code porte')} <i class="cam"></i></span><b class="code" data-info="door_code">••••</b>${T('keys.code.s', 'Porte principale', 'small')}</${b}>
    <${b} class="key link" data-ids="alarme" data-title="Lecteur d’alarme Verisure"><span class="eyebrow">${T('keys.alarm.t', 'Alarme')} <i class="cam"></i></span>${T('keys.alarm.v', 'Badge Verisure', 'b')}${T('keys.alarm.s', 'À passer sur le lecteur', 'small')}</${b}>
    <${b} class="key link" data-ids="containers" data-title="Containers poubelles"><span class="eyebrow">${T('keys.bins.t', 'Poubelles')} <i class="cam"></i></span>${T('keys.bins.v', 'Containers', 'b')}${T('keys.bins.s', 'À gauche en sortant, sous le porche', 'small')}</${b}>
    <div class="key"><span class="eyebrow">${T('keys.light.t', 'Lumière entrée')}</span>${T('keys.light.v', 'Ne pas allumer', 'b', 'no')}${T('keys.light.s', 'Lumière principale', 'small')}</div>
  </div>`;
}

// ---- étapes
let STEPS = [];
export async function loadSteps() {
  const { data } = await sb.from('process_steps').select('*').eq('active', true).order('position');
  STEPS = data || [];
  await info();
}
const withCode = (s) => esc(s).replace('{door_code}', `<span class="code">${esc(INFO?.door_code || '••••')}</span>`);

export function stepsHTML(section) {
  const ed = isEditing();
  const steps = STEPS.filter((s) => s.section === section);
  const groups = [...new Set(steps.map((s) => s.grp))];
  let n = 0;
  return groups.map((g) => {
    const list = steps.filter((s) => s.grp === g);
    return `<div class="grp">${esc(g)}</div><ol>` + list.map((s, k) => {
      n++;
      if (ed) {
        return `<li class="step"><span class="n">${n}</span><span class="x"><span class="lbl-ed" data-step="${s.id}" data-f="text" contenteditable="plaintext-only">${esc(s.text)}</span><span class="ed-tools">${k > 0 ? `<button type="button" class="ed-btn mv" data-smv="${s.id}|-1" title="Monter">↑</button>` : ''}${k < list.length - 1 ? `<button type="button" class="ed-btn mv" data-smv="${s.id}|1" title="Descendre">↓</button>` : ''}<button type="button" class="ed-btn" data-srm="${s.id}" title="Supprimer cette étape">×</button><button type="button" class="ed-btn ph-add" data-addph="step|${s.id}" data-label="${esc(s.text.replace('{door_code}', ''))}" data-slots="${(s.photo_slots || []).join(',')}" title="Ajouter une photo">📷+</button></span>${s.photo_slots?.length ? chip(s.photo_slots, s.text.replace('{door_code}', '')) : ''}`
          + `<span class="d">Précision : <span class="lbl-ed" data-step="${s.id}" data-f="detail" contenteditable="plaintext-only">${esc(s.detail || '')}</span></span>`
          + `<span class="d">Alerte : <span class="lbl-ed" data-step="${s.id}" data-f="warn" contenteditable="plaintext-only">${esc(s.warn || '')}</span></span></span></li>`;
      }
      const plain = s.text.replace('{door_code}', INFO?.door_code || '');
      const ph = s.photo_slots?.length;
      const link = ph ? ` class="step ph-link" data-ids="${s.photo_slots.join(',')}" data-title="${esc(plain)}" tabindex="0" role="button"` : ' class="step"';
      return `<li${link}><span class="n">${n}</span><span class="x">${s.day_tag ? `<span class="day">${esc(s.day_tag)}</span>` : ''}${withCode(s.text)}${ph ? chip(s.photo_slots, plain, true) : ''}${s.detail ? `<span class="d">${esc(s.detail)}</span>` : ''}</span></li>${s.warn ? `<li class="warn">⚠ ${esc(s.warn)}</li>` : ''}`;
    }).join('') + '</ol>'
      + (ed ? `<form class="ed-add" data-sadd="${section}|${esc(g)}"><input type="text" placeholder="Nouvelle étape (${esc(g)})" required><button type="submit">Ajouter</button></form>` : '');
  }).join('');
}

// ---- édition des étapes (admin)
export function bindStepEditing(rerender) {
  document.addEventListener('slotadded', (e) => { const { kind, id, slots } = e.detail; const s = STEPS.find((x) => x.id === id); if (kind === 'step' && s) { s.photo_slots = slots; rerender(); } });
  document.addEventListener('focusout', async (e) => {
    const el = e.target.closest?.('[data-step][contenteditable]'); if (!el) return;
    const s = STEPS.find((x) => x.id === el.dataset.step); if (!s) return;
    const f = el.dataset.f, v = el.textContent.trim();
    if (f === 'text' && !v) { el.textContent = s.text; return; }
    if ((s[f] || '') === v) return;
    const patch = { [f]: v || null, updated_at: new Date().toISOString() };
    const { error } = await sb.from('process_steps').update(patch).eq('id', s.id);
    if (!error) Object.assign(s, patch);
  });
  document.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-srm]');
    if (rm) { await sb.from('process_steps').update({ active: false }).eq('id', rm.dataset.srm); await loadSteps(); rerender(); return; }
    const mv = e.target.closest('[data-smv]'); if (!mv) return;
    const [id, d] = mv.dataset.smv.split('|'); const s = STEPS.find((x) => x.id === id);
    const list = STEPS.filter((x) => x.section === s.section && x.grp === s.grp);
    const k = list.indexOf(s), o = list[k + +d]; if (!o) return;
    await sb.from('process_steps').update({ position: o.position }).eq('id', s.id);
    await sb.from('process_steps').update({ position: s.position }).eq('id', o.id);
    await loadSteps(); rerender();
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-sadd]'); if (!f) return; e.preventDefault();
    const [section, grp] = f.dataset.sadd.split('|'); const text = f.querySelector('input').value.trim(); if (!text) return;
    const list = STEPS.filter((x) => x.section === section && x.grp === grp);
    const pos = list.length ? Math.max(...list.map((x) => x.position)) + 0.5 : 999;
    await sb.from('process_steps').insert({ section, grp, text, position: Math.ceil(pos) });
    // renumérote la section pour garder des positions entières et ordonnées
    await loadSteps();
    const sec = STEPS.filter((x) => x.section === section);
    for (let i = 0; i < sec.length; i++) if (sec[i].position !== i + 1) await sb.from('process_steps').update({ position: i + 1 }).eq('id', sec[i].id);
    await loadSteps(); rerender();
  });
}

let TASKS = [], LISTS = [];
export async function loadLists() {
  const { data } = await sb.from('studio_items').select('*').eq('active', true).order('position');
  TASKS = (data || []).filter((i) => i.list === 'tasks');
  LISTS = (data || []).filter((i) => i.list !== 'tasks');
}
export function rangementHTML() {
  const block = (list, cls, title, g, gt) => `<div class="std ${cls}"><h3>${title} ${chip(GROUPS[g], gt)}</h3><ul>${LISTS.filter((i) => i.list === list).map((i) => `<li>${esc(i.label)}</li>`).join('')}</ul></div>`;
  return `<div class="rg">${block('studios', 's', 'Studios A et B', 'studios', 'Studios A, B et SAS')}${block('playback', 'b', 'Playback Solutions', 'bureau', 'Bureau Playback rangé')}</div>`;
}
export function planningHTML() {
  const rows = [...TASKS].sort((a, b) => (a.moment === b.moment ? a.position - b.position : a.moment === 'matin' ? -1 : 1));
  return `<div class="plan-wrap"><table class="plan">
    <thead><tr><th>Tâche</th><th>Lun</th><th>Mar</th><th>Mer</th><th>Jeu</th><th>Ven</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td><b>${esc(r.label)}${r.photo_slots?.length ? ' ' + chip(r.photo_slots, r.label) : ''}</b><small>${r.moment === 'matin' ? 'Le matin' : 'Dans la journée'}</small></td>${[1, 2, 3, 4, 5].map((d) => (r.weekdays || []).includes(d) ? '<td class="on">●</td>' : '<td></td>').join('')}</tr>`).join('')}</tbody></table></div>`;
}
