// Photos de référence : emplacements, pastilles, galerie, ajout / remplacement (Supabase Storage).
import { sb, $, esc, ROOT } from './core.js?v=7';

const BUCKET = 'studio-photos';
export const CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';

// Ordre de la planche (numéro = position). 3e valeur : photo d'origine livrée avec le site.
export const SLOTS = [
  ['code', 'Boîtier à code (porte principale)'], ['alarme', 'Lecteur d’alarme Verisure', 'alarme'],
  ['tableau', 'Lumières du tableau électrique', 'tableau'], ['cuisine', 'Lumière de la cuisine', 'cuisine'],
  ['frigopiano', 'Les 2 lumières frigo / piano', 'frigopiano'], ['bureau', 'Bureau Playback rangé', 'bureau'],
  ['ipad', 'iPad musique (bureau)', 'ipad'], ['deso-bureau', 'Désodorisant du bureau', 'deso-bureau'],
  ['A1', 'Studio A · vue 1'], ['A2', 'Studio A · vue 2'], ['A3', 'Studio A · vue 3'],
  ['B1', 'Studio B · vue 1'], ['B2', 'Studio B · vue 2'], ['B3', 'Studio B · vue 3'], ['sas', 'SAS rangé'],
  ['frigos', 'Frigos du studio remplis'], ['deso-studio', 'Désodorisant du studio', 'deso-studio'],
  ['ipad-sas', 'iPad du SAS (lumières)', 'ipad-sas'], ['hue', 'Télécommande Philips Hue', 'hue'],
  ['containers', 'Containers poubelles (sous le porche)'], ['recyclage', 'Bac de recyclage'],
];
export const S = {};
SLOTS.forEach(([id, label, emb], i) => (S[id] = { id, label, n: i + 1, emb: emb ? `${ROOT}assets/photos/${emb}.jpg` : null, url: null, path: null }));
// Emplacements ajoutés à la demande (photo d'une tâche, d'une étape…)
export function ensureSlot(id, label) {
  if (!S[id]) { SLOTS.push([id, label]); S[id] = { id, label, n: SLOTS.length, emb: null, url: null, path: null }; }
  return S[id];
}
// Bouton « + photo » (mode édition) : ajoute un emplacement photo à une tâche, un point ou une étape
const OWNER = { item: 'studio_items', step: 'process_steps' };
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-addph]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [kind, id] = b.dataset.addph.split('|');
  const slots = (b.dataset.slots || '').split(',').filter(Boolean);
  const slot = `x-${kind}-${id}-${Date.now().toString(36)}`;
  const label = b.dataset.label || 'Photo';
  const next = [...slots, slot];
  const { error } = await sb.from(OWNER[kind]).update({ photo_slots: next }).eq('id', id);
  if (error) return;
  ensureSlot(slot, label);
  document.dispatchEvent(new CustomEvent('slotadded', { detail: { kind, id, slots: next } }));
  openGal([slot], label);
}, true);
export const GROUPS = { studios: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'sas'], bureau: ['bureau'], recyclage: ['recyclage'] };

const listeners = [];
export const onPhotosChange = (fn) => listeners.push(fn);
const src = (s) => s.url || s.emb;

function nums(ids) {
  const n = ids.map((i) => S[i].n); const out = []; let a = n[0], b = n[0];
  for (let k = 1; k <= n.length; k++) { if (n[k] === b + 1) { b = n[k]; continue; } out.push(a === b ? a : a + '–' + b); a = b = n[k]; }
  return out.join(', ');
}
export function chip(ids, title, inert) {
  ids.forEach((i) => ensureSlot(i, String(title).replace(/<[^>]+>/g, '')));
  const miss = ids.some((i) => !src(S[i])); const tag = inert ? 'span' : 'button';
  return `<${tag} class="chip${miss ? ' missing' : ''}" data-ids="${ids.join(',')}" data-title="${esc(title)}" aria-label="Voir les photos : ${esc(String(title).replace(/<[^>]+>/g, ''))}">${CAM}${nums(ids)}${miss ? '<i class="dot" title="Photo à ajouter"></i>' : ''}</${tag}>`;
}
export function boardHTML() {
  return SLOTS.map(([id]) => {
    const s = S[id], u = src(s);
    return `<button class="thumb" data-ids="${id}" data-title="${esc(s.label)}"><span class="ph${u ? '' : ' empty'}">${u ? `<img src="${u}" alt="${esc(s.label)}" loading="lazy">` : `<span>${CAM}Photo à ajouter</span>`}</span><span class="cap"><b>${s.n}</b>${esc(s.label)}</span></button>`;
  }).join('');
}

export async function loadPhotos() {
  const { data, error } = await sb.from('studio_photos').select('slot,path,label');
  if (error) return;
  for (const id in S) { S[id].url = null; S[id].path = null; }
  (data || []).forEach((r) => { if (!S[r.slot]) ensureSlot(r.slot, r.label || 'Photo'); });
  const rows = data || [];
  if (rows.length) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 60 * 60 * 12);
    rows.forEach((r, i) => { S[r.slot].path = r.path; S[r.slot].url = signed?.[i]?.signedUrl || null; });
  }
  listeners.forEach((f) => f());
  if (G.open) drawGal();
}

// ---------------- galerie
const G = { open: false, ids: [], i: 0, title: '', busy: false, msg: '' };
let gal, frame, fileIn, lastFocus = null;

function mountGallery() {
  const el = document.createElement('div');
  el.innerHTML = `<div class="gal" id="gal" hidden role="dialog" aria-modal="true" aria-labelledby="gal-title">
    <div class="gal-top"><div><h3 id="gal-title"></h3><small id="gal-sub"></small></div><button class="btn close-x" id="gal-close" aria-label="Fermer">✕</button></div>
    <div class="gal-stage"><button class="nav" id="prev" aria-label="Photo précédente">‹</button><div class="frame" id="frame"></div><button class="nav" id="next" aria-label="Photo suivante">›</button></div>
    <div class="gal-bottom"><div class="acts" id="acts"></div><div class="strip" id="strip"></div></div>
    <input type="file" id="file" accept="image/*" class="sr"></div>`;
  document.body.append(el.firstElementChild);
  gal = $('gal'); frame = $('frame'); fileIn = $('file');

  document.addEventListener('click', (e) => {
    if (e.target.closest('.ck,select,[contenteditable],.tx-del,.ed-btn,.ed-add')) return;
    const c = e.target.closest('.chip,.thumb,li.ph-link,.key.link'); if (c) { openGal(c.dataset.ids.split(','), c.dataset.title); return; }
    const k = e.target.closest('#strip button'); if (k) { G.i = +k.dataset.k; G.msg = ''; drawGal(); return; }
    if (e.target.closest('#pick')) { fileIn.value = ''; fileIn.click(); return; }
    if (e.target.closest('#reset')) { resetSlot(); return; }
    if (e.target.closest('#gal-close') || e.target === gal) { closeGal(); return; }
    if (e.target.closest('#prev')) step(-1); if (e.target.closest('#next')) step(1);
  });
  fileIn.addEventListener('change', () => upload(fileIn.files[0]));
  document.addEventListener('keydown', (e) => {
    if (!G.open) {
      const l = e.target.closest?.('li.ph-link');
      if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openGal(l.dataset.ids.split(','), l.dataset.title); }
      return;
    }
    if (e.key === 'Escape') closeGal(); if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1);
  });
  frame.addEventListener('dragover', (e) => { e.preventDefault(); frame.classList.add('over'); $('drop')?.classList.add('over'); });
  frame.addEventListener('dragleave', () => { frame.classList.remove('over'); $('drop')?.classList.remove('over'); });
  frame.addEventListener('drop', (e) => { e.preventDefault(); frame.classList.remove('over'); upload(e.dataTransfer.files[0]); });
  gal.addEventListener('dragover', (e) => e.preventDefault()); gal.addEventListener('drop', (e) => e.preventDefault());
  let tx = null;
  frame.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  frame.addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); tx = null; });
}

export function openGallery(ids, title) { openGal(ids, title); }
function openGal(ids, title) { G.ids = ids; G.i = 0; G.title = title; G.open = true; G.msg = ''; lastFocus = document.activeElement; gal.hidden = false; document.body.style.overflow = 'hidden'; drawGal(); $('gal-close').focus(); }
function closeGal() { G.open = false; gal.hidden = true; document.body.style.overflow = ''; lastFocus?.focus?.(); }
function drawGal() {
  const s = S[G.ids[G.i]], u = src(s);
  $('gal-title').textContent = G.ids.length > 1 ? G.title : s.label;
  $('gal-sub').textContent = `Photo ${s.n}${G.ids.length > 1 ? ` · ${s.label} · ${G.i + 1} sur ${G.ids.length}` : ''}`;
  frame.innerHTML = u ? `<img src="${u}" alt="${esc(s.label)}">` : `<div class="drop" id="drop">${CAM}<div><strong>Glisser la photo ici</strong>ou utiliser le bouton ci-dessous</div></div>`;
  $('prev').disabled = G.i === 0; $('next').disabled = G.i === G.ids.length - 1;
  for (const b of ['prev', 'next']) $(b).style.visibility = G.ids.length < 2 ? 'hidden' : 'visible';
  $('strip').innerHTML = G.ids.length > 1 ? G.ids.map((id, k) => { const t = S[id], v = src(t); return `<button class="${k === G.i ? 'cur' : ''}" data-k="${k}" aria-label="${esc(t.label)}">${v ? `<img src="${v}" alt="">` : t.n}</button>`; }).join('') : '';
  $('acts').innerHTML = G.busy ? '<span class="msg">Envoi de la photo…</span>'
    : `<button class="btn primary" id="pick">${u ? 'Remplacer la photo' : 'Choisir une photo'}</button>${s.path ? `<button class="btn" id="reset">${s.emb ? 'Revenir à la photo d’origine' : 'Retirer la photo'}</button>` : ''}${G.msg ? `<span class="msg">${esc(G.msg)}</span>` : ''}`;
}
function step(d) { const j = G.i + d; if (j < 0 || j >= G.ids.length) return; G.i = j; G.msg = ''; drawGal(); }
async function toJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const max = 1600, r = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}
async function upload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { G.msg = 'Ce fichier n’est pas une image.'; drawGal(); return; }
  const slot = G.ids[G.i]; G.busy = true; G.msg = ''; drawGal();
  try {
    let blob; try { blob = await toJpeg(file); } catch { throw { code: 'decode' }; }
    const path = `${slot}/${Date.now()}.jpg`;
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    const old = S[slot].path;
    const { error } = await sb.from('studio_photos').upsert({ slot, path, label: S[slot].label, updated_at: new Date().toISOString() });
    if (error) throw error;
    if (old) sb.storage.from(BUCKET).remove([old]);
    G.msg = 'Photo enregistrée pour toute l’équipe.';
    await loadPhotos();
  } catch (e) {
    G.msg = e?.code === 'decode' ? 'Format non lisible ici (HEIC ?). Exporter la photo en JPG puis réessayer.' : 'L’envoi a échoué. Réessayer dans un instant.';
  } finally { G.busy = false; drawGal(); }
}
async function resetSlot() {
  const slot = G.ids[G.i], old = S[slot].path;
  const { error } = await sb.from('studio_photos').delete().eq('slot', slot);
  if (error) { G.msg = 'Impossible de retirer la photo.'; drawGal(); return; }
  if (old) sb.storage.from(BUCKET).remove([old]);
  G.msg = ''; await loadPhotos();
}

export function initPhotos() {
  mountGallery();
  sb.channel('photos').on('postgres_changes', { event: '*', schema: 'public', table: 'studio_photos' }, () => loadPhotos()).subscribe();
  return loadPhotos();
}
