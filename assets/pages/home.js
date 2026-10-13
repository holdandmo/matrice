import { requireMember } from '../core.js';
import { initPhotos, onPhotosChange } from '../photos.js';
import { KEYS_HTML, fillInfo } from '../procedure.js';
import { initChecklist } from '../checklist.js';
import { initDayTasks } from '../daytasks.js';

const { me } = await requireMember();
document.getElementById('keys').innerHTML = KEYS_HTML;
fillInfo();
const [tasks, list] = await Promise.all([initDayTasks(me), initChecklist(me)]);
onPhotosChange(() => { tasks.rerender(); list.rerender(); });
initPhotos();
