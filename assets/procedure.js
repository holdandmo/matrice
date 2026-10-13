// Contenu de l'Internal process : procédure d'ouverture et de fermeture.
import { sb, esc } from './core.js?v=5';
import { chip, GROUPS } from './photos.js?v=5';

export const KEYS_HTML = `
  <div class="keys">
    <button class="key link" data-ids="code" data-title="Boîtier à code de la porte principale"><span class="eyebrow">Code porte <i class="cam"></i></span><b class="code" data-info="door_code">••••</b><small>Porte principale · voir le boîtier</small></button>
    <button class="key link" data-ids="alarme" data-title="Lecteur d’alarme Verisure"><span class="eyebrow">Alarme <i class="cam"></i></span><b>Badge Verisure</b><small>À passer sur le lecteur · voir</small></button>
    <button class="key link" data-ids="containers" data-title="Containers poubelles"><span class="eyebrow">Poubelles <i class="cam"></i></span><b>Containers</b><small>À gauche en sortant, sous le porche</small></button>
    <div class="key"><span class="eyebrow">Lumière entrée</span><b class="no">Ne pas allumer</b><small>Lumière principale</small></div>
  </div>`;

export const LISTS = {
  open: [
    ['Entrée', [
      { x: 'Porte principale : code <span class="code" data-info="door_code">••••</span>', p: ['code'] },
      { x: 'Ouvrir le rideau métallique' },
      { x: 'Désactiver l’alarme (badge Verisure)', p: ['alarme'] },
      { x: 'Allumer uniquement : tableau électrique, cuisine, les 2 lumières frigo / piano', p: ['tableau', 'cuisine', 'frigopiano'], warn: 'Ne pas allumer la lumière principale de l’entrée' },
    ]],
    ['Playback Solutions · bureau', [
      { x: 'Ouvrir la porte du bureau' },
      { x: 'Vérifier le rangement du bureau', d: 'Liste « Playback Solutions » de l’accueil', p: ['bureau'] },
      { x: 'Allumer la musique via l’iPad', p: ['ipad'] },
      { day: 'MAR & VEN', x: 'Désodorisant dans le bureau', p: ['deso-bureau'] },
    ]],
    ['AccessFlow · studios', [
      { x: 'Ouvrir la porte du studio' },
      { x: 'Vérifier les studios A, B et le SAS', d: 'Liste « Studios A et B » de l’accueil', p: GROUPS.studios },
      { day: 'MAR & VEN', x: 'Désodorisant dans le studio', p: ['deso-studio'] },
      { x: 'Remplir le stock des frigos du studio', p: ['frigos'] },
    ]],
    ['Espace commun', [
      { x: 'Laver la vaisselle sale, ranger la propre' },
      { x: 'Changer la poubelle de la cuisine si elle est pleine', d: 'Containers à gauche en sortant, sous le porche', p: ['containers'] },
    ]],
  ],
  close: [
    ['AccessFlow · studios', [
      { x: 'Ranger les studios A, B et le SAS', d: 'Liste « Studios A et B » de l’accueil', p: GROUPS.studios },
      { x: 'Éteindre les lumières via l’iPad du SAS', p: ['ipad-sas'] },
      { x: 'Fermer à clé la porte du studio uniquement' },
    ]],
    ['Playback Solutions · bureau', [
      { x: 'Ranger le bureau et la mezzanine', d: 'Liste « Playback Solutions » de l’accueil', p: ['bureau'] },
      { x: 'Éteindre la musique via l’iPad', p: ['ipad'] },
      { x: 'Éteindre la lumière (télécommande Philips Hue)', p: ['hue'] },
      { x: 'Fermer à clé la porte du bureau' },
    ]],
    ['Espace commun · en dernier', [
      { x: 'Laver la vaisselle sale, ranger la propre' },
      { x: 'Coup d’éponge sur la table et le plan de travail' },
      { x: 'Éteindre toutes les lumières' },
      { x: 'Activer l’alarme (badge Verisure)', p: ['alarme'] },
      { x: 'Fermer le rideau métallique' },
      { x: 'Fermer la porte d’entrée et vérifier qu’elle est bien verrouillée' },
    ]],
  ],
};

export function stepsHTML(which) {
  let n = 0;
  return LISTS[which].map(([g, items]) => `<div class="grp">${g}</div><ol>` + items.map((it) => {
    n++; const plain = it.x.replace(/<[^>]+>/g, '');
    const link = it.p ? ` class="step ph-link" data-ids="${it.p.join(',')}" data-title="${esc(plain)}" tabindex="0" role="button"` : ' class="step"';
    return `<li${link}><span class="n">${n}</span><span class="x">${it.day ? `<span class="day">${it.day}</span>` : ''}${it.x}${it.p ? chip(it.p, plain, true) : ''}${it.d ? `<span class="d">${it.d}</span>` : ''}</span></li>${it.warn ? `<li class="warn">⚠ ${it.warn}</li>` : ''}`;
  }).join('') + '</ol>').join('');
}

export const RANGEMENT = {
  studios: ['Cendriers vidés et lavés', 'Tables nettoyées', 'Aspirateur passé', 'Bouteilles d’eau vidées et jetées à la poubelle', 'Verres d’eau débarrassés et lavés', 'Poubelles vidées', 'Câbles pliés, instruments rangés sur leurs pieds'],
  playback: ['Outils rangés à leur place', 'Kits alignés le long du mur', 'Tables propres', 'Chaises rangées sous les tables', 'Mezzanine rangée et nettoyée : aspirateur, ateliers propres et rangés, bureau propre et rangé'],
};

export function planningHTML() {
  return `<div class="plan-wrap"><table class="plan">
    <thead><tr><th>Tâche</th><th>Lun</th><th>Mar</th><th>Mer</th><th>Jeu</th><th>Ven</th></tr></thead>
    <tbody>
      <tr><td><b>Sortir les poubelles</b><small>Le matin</small></td><td class="on">●</td><td></td><td class="on">●</td><td></td><td class="on">●</td></tr>
      <tr><td><b>Sortir le recyclage ${chip(GROUPS.recyclage, 'Bac de recyclage')}</b><small>Le matin, mardi uniquement</small></td><td></td><td class="on">●</td><td></td><td></td><td></td></tr>
      <tr><td><b>Désodorisant</b><small>Bureau et studio, le matin</small></td><td></td><td class="on">●</td><td></td><td></td><td class="on">●</td></tr>
      <tr><td><b>Liste de courses espace commun</b><small>Mise à jour + achat, dans la journée</small></td><td></td><td class="on">●</td><td></td><td></td><td></td></tr>
    </tbody></table></div>`;
}

// Infos sensibles chargées après connexion (code de la porte…)
let INFO = null;
export async function fillInfo(root = document) {
  if (!INFO) { const { data } = await sb.from('studio_info').select('key,value'); INFO = Object.fromEntries((data || []).map((r) => [r.key, r.value])); }
  root.querySelectorAll('[data-info]').forEach((el) => { if (INFO[el.dataset.info]) el.textContent = INFO[el.dataset.info]; });
}
