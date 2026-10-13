import { sb, $, esc, fmtDT, requireMember, processStatus } from '../core.js';
import { initPhotos, onPhotosChange, boardHTML, chip, GROUPS } from '../photos.js';
import { KEYS_HTML, stepsHTML, RANGEMENT, planningHTML, fillInfo } from '../procedure.js';

const { me } = await requireMember();
let ps = await processStatus(me);
const read = new Set();

const SECTIONS = [
  ['infos', 'Les infos à connaître', 'Code de la porte, alarme, poubelles et la lumière à ne jamais allumer. Toucher une case pour voir la photo.', () => KEYS_HTML],
  ['ouverture', 'L’ouverture', 'À l’arrivée, dans l’ordre. Toucher une étape pour voir la photo de référence.', () => `<div class="col open"><div class="band"><h2>Ouverture</h2><span>À l’arrivée, dans l’ordre</span></div>${stepsHTML('open')}</div>`],
  ['fermeture', 'La fermeture', 'Au départ, dans l’ordre. L’espace commun se ferme en dernier.', () => `<div class="col close"><div class="band"><h2>Fermeture</h2><span>Au départ, dans l’ordre</span></div>${stepsHTML('close')}</div>`],
  ['rangement', 'Les listes de rangement', 'Les mêmes points le soir (on range) et le lendemain matin (on vérifie). Comparer avec les photos de référence.', () => `<div class="rg"><div class="std s"><h3>Studios A et B ${chip(GROUPS.studios, 'Studios A, B et SAS')}</h3><ul>${RANGEMENT.studios.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="std b"><h3>Playback Solutions ${chip(GROUPS.bureau, 'Bureau Playback rangé')}</h3><ul>${RANGEMENT.playback.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`],
  ['semaine', 'Les tâches de la semaine', 'Elles apparaissent automatiquement dans les tâches du jour, à l’accueil.', planningHTML],
  ['outil', 'Utiliser la liste du jour', 'La page d’accueil est la liste à suivre chaque jour.', () => `<div class="howto"><div><b>Le soir, en fermant</b><span>Ranger, puis cocher chaque point dans la colonne « Soir ». La première case cochée met votre nom dans « Fait par ».</span></div><div><b>Le matin, en ouvrant</b><span>Vérifier que tout est resté rangé et cocher la colonne « Matin ». Faire les tâches du jour affichées.</span></div><div><b>Quand tout est coché</b><span>La liste est enregistrée dans l’historique avec les noms, puis repart à zéro pour le soir. Une liste oubliée est enregistrée « Incomplet ».</span></div></div>`],
  ['photos', 'Les photos de référence', 'Ce à quoi chaque endroit doit ressembler. Une photo manquante ou dépassée se remplace en la glissant sur son cadre.', () => `<div class="board">${boardHTML()}</div>`],
];

function render() {
  $('pv').textContent = ps.version ? `Version ${ps.version.version} · ${ps.version.title}. À lire en entier, puis à valider tout en bas.` : '';
  const done = SECTIONS.every(([k]) => read.has(k)) || ps.acked;
  $('proc').innerHTML = SECTIONS.map(([k, title, lead, body], i) => `<section class="proc-sec" id="s-${k}"><h2><span class="num">${String(i + 1).padStart(2, '0')}</span>${title}</h2><p class="lead">${lead}</p>${body()}${ps.acked ? '' : `<label class="read-mark${read.has(k) ? ' on' : ''}"><input type="checkbox" data-read="${k}"${read.has(k) ? ' checked' : ''}> J’ai lu cette partie</label>`}</section>`).join('')
    + (ps.acked
      ? `<div class="ack done"><h2>Lecture validée</h2><p class="prog-read">Vous avez validé la version ${ps.version.version} le ${fmtDT(ps.ackedAt)}. Merci.</p></div>`
      : `<div class="ack" id="ack"><h2>Valider ma lecture</h2><p class="prog-read">${read.size} partie${read.size > 1 ? 's' : ''} lue${read.size > 1 ? 's' : ''} sur ${SECTIONS.length}.${done ? '' : ' Cocher « J’ai lu cette partie » sous chaque partie.'}</p>
        <label class="pledge"><input type="checkbox" id="pledge"${done ? '' : ' disabled'}> Je confirme avoir lu l’intégralité de l’Internal process, l’avoir bien compris, et je m’engage à le respecter.</label>
        <button type="button" id="ack-go" disabled>Valider ma lecture</button><p class="err" id="ack-err" role="alert"></p></div>`);
  fillInfo();
}
document.addEventListener('change', (e) => {
  const r = e.target.closest('input[data-read]');
  if (r) { r.checked ? read.add(r.dataset.read) : read.delete(r.dataset.read); const y = scrollY; render(); scrollTo(0, y); return; }
  if (e.target.id === 'pledge') $('ack-go').disabled = !e.target.checked;
});
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'ack-go') return;
  e.target.disabled = true;
  const { error } = await sb.from('process_acks').insert({ member_id: me.id, version: ps.version.version });
  if (error) { $('ack-err').textContent = 'La validation n’a pas été enregistrée. Réessayer.'; e.target.disabled = false; return; }
  ps = await processStatus(me); render();
  $('ack')?.scrollIntoView({ block: 'center' });
});
render();
onPhotosChange(() => { const y = scrollY; render(); scrollTo(0, y); });
initPhotos();
