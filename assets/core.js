// Socle commun : client Supabase, connexion, navigation, utilitaires.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = window.__SB_MOCK__ || createClient(SUPABASE_URL, SUPABASE_KEY);
export const ROOT = document.body.dataset.root || './';
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmt = (iso) => parse(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtS = (iso) => parse(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDT = (ts) => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const NAV = [
  ['home', 'Accueil', ''],
  ['process', 'Internal process', 'process/'],
  ['historique', 'Historique', 'historique/'],
  ['admin', 'Admin', 'admin/', true],
];

function shell() {
  const page = document.body.dataset.page;
  const top = document.createElement('header');
  top.className = 'site-top no-print'; top.id = 'site-top'; top.hidden = true;
  document.body.prepend(top);
  const gate = document.createElement('div');
  gate.id = 'gate';
  gate.innerHTML = `
    <form class="login" id="login" hidden>
      <div class="eyebrow">Hold &amp; Motion</div>
      <h1>Connexion</h1>
      <p>Avec votre e-mail et votre mot de passe.</p>
      <label for="em">E-mail</label><input id="em" type="email" autocomplete="username" required>
      <label for="pw" class="gap">Mot de passe</label><input id="pw" type="password" autocomplete="current-password" required>
      <button id="go" type="submit">Se connecter</button>
      <p class="err" id="login-err" role="alert"></p>
    </form>
    <form class="login" id="newpw" hidden>
      <div class="eyebrow">Première connexion</div>
      <h1>Choisir votre mot de passe</h1>
      <p>Le mot de passe provisoire doit être remplacé. 8 caractères minimum.</p>
      <label for="np1">Nouveau mot de passe</label><input id="np1" type="password" autocomplete="new-password" minlength="8" required>
      <label for="np2" class="gap">Confirmer</label><input id="np2" type="password" autocomplete="new-password" minlength="8" required>
      <button id="np-go" type="submit">Enregistrer</button>
      <p class="err" id="np-err" role="alert"></p>
    </form>
    <div class="login" id="noaccess" hidden>
      <h1>Accès non activé</h1>
      <p>Ce compte n’est pas rattaché à l’équipe. Contacter l’administrateur.</p>
      <button type="button" id="na-out">Se déconnecter</button>
    </div>`;
  document.body.prepend(gate);
  return { page, top };
}

function renderNav(top, page, me) {
  top.innerHTML = `<nav class="nav-in"><a class="brand" href="${ROOT}">Hold &amp; Motion</a><div class="tabs">${NAV.filter((n) => !n[3] || me.role === 'admin').map(([k, label, href]) => `<a href="${ROOT}${href}"${k === page ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div><div class="who"><div class="notif-wrap"><button type="button" class="bell" id="bell" aria-label="Notifications" aria-expanded="false" aria-controls="notif">${BELL}</button><div class="notif" id="notif" hidden></div></div><span>${esc(me.name)}</span><button type="button" id="logout">Se déconnecter</button></div></nav>`;
  top.hidden = false;
  $('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  const bell = $('bell'), panel = $('notif');
  bell.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; bell.setAttribute('aria-expanded', String(!panel.hidden)); });
  document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('.notif-wrap')) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; bell.focus(); } });
  refreshNotifications(me);
}

const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

// Notifications non lues (pour l'instant : l'Internal process à lire et valider)
export async function refreshNotifications(me) {
  const panel = $('notif'), bell = $('bell'); if (!panel) return;
  const items = [];
  const ps = await processStatus(me);
  if (!ps.acked && ps.version) items.push({ href: `${ROOT}process/`, title: 'Internal process à lire et valider', sub: `Version ${ps.version.version} · ${ps.version.title}` });
  bell.querySelector('.badge')?.remove();
  if (items.length) bell.insertAdjacentHTML('beforeend', `<span class="badge">${items.length}</span>`);
  bell.setAttribute('aria-label', items.length ? `Notifications : ${items.length} non lue${items.length > 1 ? 's' : ''}` : 'Notifications');
  panel.innerHTML = '<h4>Notifications</h4>' + (items.length
    ? items.map((n) => `<a class="unread" href="${n.href}"><b>${esc(n.title)}</b><small>${esc(n.sub)}</small></a>`).join('')
    : '<p>Rien de nouveau.</p>');
}

// Résout quand la personne est connectée, rattachée à l'équipe et a choisi son mot de passe.
export function requireMember() {
  const { page, top } = shell();
  const app = $('app');
  const show = (id) => { for (const f of ['login', 'newpw', 'noaccess']) $(f).hidden = f !== id; app.hidden = true; };

  return new Promise((resolve) => {
    async function enter() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { show('login'); $('em').focus(); return; }
      const { data: me } = await sb.from('team_members').select('id,name,role,must_change_password,email').eq('user_id', user.id).maybeSingle();
      if (!me) { show('noaccess'); return; }
      if (me.must_change_password) { show('newpw'); $('np1').focus(); return; }
      for (const f of ['login', 'newpw', 'noaccess']) $(f).hidden = true;
      renderNav(top, page, me);
      app.hidden = false;
      resolve({ me, isAdmin: me.role === 'admin' });
    }
    $('login').addEventListener('submit', async (e) => {
      e.preventDefault(); $('go').disabled = true; $('login-err').textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
      $('go').disabled = false;
      if (error) { $('login-err').textContent = 'E-mail ou mot de passe incorrect.'; return; }
      $('pw').value = ''; enter();
    });
    $('newpw').addEventListener('submit', async (e) => {
      e.preventDefault(); const a = $('np1').value, b = $('np2').value; $('np-err').textContent = '';
      if (a.length < 8) { $('np-err').textContent = '8 caractères minimum.'; return; }
      if (a !== b) { $('np-err').textContent = 'Les deux mots de passe sont différents.'; return; }
      $('np-go').disabled = true;
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) { $('np-go').disabled = false; $('np-err').textContent = 'Mot de passe refusé : en choisir un autre, plus long.'; return; }
      await sb.rpc('mark_password_changed');
      $('np-go').disabled = false; enter();
    });
    $('na-out').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    enter();
  });
}

// Version en cours de l'Internal process et validation de la personne connectée.
export async function processStatus(me) {
  const { data: v } = await sb.from('process_versions').select('*').order('version', { ascending: false }).limit(1).maybeSingle();
  if (!v) return { version: null, acked: true };
  const { data: a } = await sb.from('process_acks').select('acknowledged_at').eq('member_id', me.id).eq('version', v.version).maybeSingle();
  return { version: v, acked: !!a, ackedAt: a?.acknowledged_at || null };
}
