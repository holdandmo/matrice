import { requireMember } from '../core.js?v=6';
import { initPhotos, onPhotosChange } from '../photos.js?v=6';
import { initChecklist } from '../checklist.js?v=6';
import { initDayTasks } from '../daytasks.js?v=6';
import { initEdit, onEditChange, T } from '../edit.js?v=6';

const { me, isAdmin } = await requireMember();
await initEdit(isAdmin);
const foot = () => { document.getElementById('home-foot').innerHTML = T('home.foot', 'Le soir : cocher « Soir » en fermant. Le matin : cocher « Matin » en ouvrant.'); };
foot(); onEditChange(foot);
const [tasks, list] = await Promise.all([initDayTasks(me), initChecklist(me)]);
onPhotosChange(() => { tasks.rerender(); list.rerender(); });
initPhotos();
