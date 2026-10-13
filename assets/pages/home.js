import { requireMember } from '../core.js?v=7';
import { initPhotos, onPhotosChange } from '../photos.js?v=7';
import { initChecklist } from '../checklist.js?v=7';
import { initDayTasks } from '../daytasks.js?v=7';
import { initEdit, onEditChange, T } from '../edit.js?v=7';

const { me, isAdmin } = await requireMember();
await initEdit(isAdmin);
const foot = () => { document.getElementById('home-foot').innerHTML = T('home.foot', 'Le soir : cocher « Soir » en fermant. Le matin : cocher « Matin » en ouvrant.'); };
foot(); onEditChange(foot);
const [tasks, list] = await Promise.all([initDayTasks(me), initChecklist(me)]);
onPhotosChange(() => { tasks.rerender(); list.rerender(); });
initPhotos();
