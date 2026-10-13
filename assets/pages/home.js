import { requireMember } from '../core.js?v=5';
import { initPhotos, onPhotosChange } from '../photos.js?v=5';
import { initChecklist } from '../checklist.js?v=5';
import { initDayTasks } from '../daytasks.js?v=5';

const { me } = await requireMember();
const [tasks, list] = await Promise.all([initDayTasks(me), initChecklist(me)]);
onPhotosChange(() => { tasks.rerender(); list.rerender(); });
initPhotos();
