import { $, ROOT, fmtDT, requireMember, processStatus } from '../core.js';
import { initPhotos, onPhotosChange } from '../photos.js';
import { KEYS_HTML, fillInfo } from '../procedure.js';
import { initChecklist } from '../checklist.js';

const { me } = await requireMember();
$('hello').textContent = `Bonjour ${me.name}, voici les tâches du jour`;
$('keys').innerHTML = KEYS_HTML;
fillInfo();
const ps = await processStatus(me);
$('ack-banner').innerHTML = ps.acked
  ? ''
  : `<div class="banner"><span>Vous n’avez pas encore lu et validé l’Internal process${ps.version ? ` (version ${ps.version.version})` : ''}.</span><a href="${ROOT}process/">Le lire maintenant</a></div>`;
const list = await initChecklist(me);
onPhotosChange(() => list.rerender());
initPhotos();
