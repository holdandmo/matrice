import { sb, $, fmtDT, requireMember, processStatus, refreshNotifications } from '../core.js?v=6';
import { initPhotos, onPhotosChange, boardHTML } from '../photos.js?v=6';
import { keysHTML, stepsHTML, planningHTML, rangementHTML, fillInfo, loadSteps, loadLists, bindStepEditing } from '../procedure.js?v=6';
import { initEdit, isEditing, onEditChange, T } from '../edit.js?v=6';

const { me, isAdmin } = await requireMember();
await Promise.all([initEdit(isAdmin), loadSteps(), loadLists()]);
let ps = await processStatus(me);
const read = new Set();

const SECTIONS = [
  ['infos', 'Les infos à connaître', '', keysHTML],
  ['ouverture', 'L’ouverture', 'Dans l’ordre. Toucher une étape pour voir la photo.', () => `<div class="col open"><div class="band">${T('process.band.open', 'Ouverture', 'h2')}</div>${stepsHTML('open')}</div>`],
  ['fermeture', 'La fermeture', 'Dans l’ordre. L’espace commun en dernier.', () => `<div class="col close"><div class="band">${T('process.band.close', 'Fermeture', 'h2')}</div>${stepsHTML('close')}</div>`],
  ['rangement', 'Les listes de rangement', 'Le soir on range, le matin on vérifie.', rangementHTML],
  ['semaine', 'Les tâches de la semaine', '', planningHTML],
  ['photos', 'Les photos de référence', '', () => `<div class="board">${boardHTML()}</div>`],
];

function render() {
  const y = scrollY;
  const ed = isEditing();
  $('pv').innerHTML = T('process.intro', 'À lire en entier, puis à valider en bas de page.');
  $('proc').innerHTML = SECTIONS.map(([k, title, lead, body], i) => `<section class="proc-sec" id="s-${k}"><h2><span class="num">${String(i + 1).padStart(2, '0')}</span>${T(`process.${k}.title`, title)}</h2>${T(`process.${k}.lead`, lead, 'p', 'lead')}${body()}${ps.acked || ed ? '' : `<label class="read-mark${read.has(k) ? ' on' : ''}"><input type="checkbox" data-read="${k}"${read.has(k) ? ' checked' : ''}> J’ai lu cette partie</label>`}</section>`).join('')
    + (ed ? '' : ps.acked
      ? `<div class="ack done"><h2>Lecture validée</h2><p class="prog-read">Version ${ps.version.version}, validée le ${fmtDT(ps.ackedAt)}.</p></div>`
      : `<div class="ack" id="ack"><h2>Valider ma lecture</h2><p class="prog-read">${read.size}/${SECTIONS.length} parties lues.</p>
        <label class="pledge"><input type="checkbox" id="pledge"${SECTIONS.every(([k]) => read.has(k)) ? '' : ' disabled'}> Je confirme avoir lu l’intégralité de l’Internal process, l’avoir bien compris, et je m’engage à le respecter.</label>
        <button type="button" id="ack-go" disabled>Valider ma lecture</button><p class="err" id="ack-err" role="alert"></p></div>`);
  fillInfo();
  scrollTo(0, y);
}
document.addEventListener('change', (e) => {
  const r = e.target.closest('input[data-read]');
  if (r) { r.checked ? read.add(r.dataset.read) : read.delete(r.dataset.read); render(); return; }
  if (e.target.id === 'pledge') $('ack-go').disabled = !e.target.checked;
});
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'ack-go') return;
  e.target.disabled = true;
  const { error } = await sb.from('process_acks').insert({ member_id: me.id, version: ps.version.version });
  if (error) { $('ack-err').textContent = 'La validation n’a pas été enregistrée. Réessayer.'; e.target.disabled = false; return; }
  ps = await processStatus(me); render(); refreshNotifications(me);
});
bindStepEditing(render);
onEditChange(render);
render();
onPhotosChange(render);
initPhotos();
