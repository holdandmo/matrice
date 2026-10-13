// Mode édition (administrateur) : textes modifiables ou masquables partout.
import { sb, esc } from './core.js?v=7';

const E = { on: false, admin: false, texts: {}, listeners: [] };
export const isEditing = () => E.on;
export const onEditChange = (fn) => E.listeners.push(fn);

export async function initEdit(isAdmin) {
  E.admin = isAdmin;
  const { data } = await sb.from('site_texts').select('key,value,hidden');
  (data || []).forEach((r) => (E.texts[r.key] = r));
  if (!isAdmin) return;
  let saved = false; try { saved = sessionStorage.getItem('edit') === '1'; } catch {}
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'edit-toggle'; btn.className = 'edit-toggle';
  const sync = () => { btn.textContent = E.on ? 'Terminer les modifications' : 'Modifier la page'; btn.setAttribute('aria-pressed', String(E.on)); document.body.classList.toggle('editing', E.on); };
  btn.addEventListener('click', () => { E.on = !E.on; try { sessionStorage.setItem('edit', E.on ? '1' : '0'); } catch {} sync(); E.listeners.forEach((f) => f()); });
  document.querySelector('.nav-in .who')?.prepend(btn);
  E.on = saved; sync();

  // enregistrement des textes libres
  document.addEventListener('focusout', async (e) => {
    const el = e.target.closest?.('[data-k][contenteditable]'); if (!el) return;
    const key = el.dataset.k, value = el.textContent.trim();
    if ((E.texts[key]?.value ?? el.dataset.def) === value) return;
    E.texts[key] = { key, value, hidden: false };
    await sb.from('site_texts').upsert({ key, value, hidden: false, updated_at: new Date().toISOString() });
  });
  document.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-k-del]'); if (!d) return;
    const key = d.dataset.kDel, hidden = !(E.texts[key]?.hidden);
    const value = E.texts[key]?.value ?? d.dataset.def ?? '';
    E.texts[key] = { key, value, hidden };
    await sb.from('site_texts').upsert({ key, value, hidden, updated_at: new Date().toISOString() });
    E.listeners.forEach((f) => f());
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest?.('[contenteditable]')) { e.preventDefault(); e.target.blur(); } });
}

// Texte libre : T('cle', 'texte par défaut', 'span'|'p'|'h2'…)
export function T(key, def, tag = 'span', cls = '') {
  const r = E.texts[key]; const value = r ? r.value : def; const hidden = r?.hidden;
  if (!E.on) return hidden || !value ? '' : `<${tag}${cls ? ` class="${cls}"` : ''}>${esc(value)}</${tag}>`;
  return `<${tag} class="${cls} tx${hidden ? ' tx-hidden' : ''}"><span data-k="${key}" data-def="${esc(def)}" contenteditable="plaintext-only" spellcheck="true">${esc(value)}</span><button type="button" class="tx-del" data-k-del="${key}" data-def="${esc(def)}" title="${hidden ? 'Réafficher' : 'Masquer cette ligne'}">${hidden ? '↺' : '×'}</button></${tag}>`;
}
