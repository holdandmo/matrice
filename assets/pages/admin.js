import { sb, $, esc, fmtDT, ROOT, requireMember } from '../core.js?v=5';

const { isAdmin } = await requireMember();
if (!isAdmin) { $('adm').innerHTML = '<p class="empty">Cette page est réservée à l’administrateur.</p>'; throw new Error('not admin'); }

async function load() {
  const [st, mem] = await Promise.all([
    sb.from('process_read_status').select('*').eq('active', true).order('name'),
    sb.from('team_members').select('id,name,email,role,user_id,must_change_password,active').order('name'),
  ]);
  if (st.error || mem.error) { $('adm').innerHTML = '<p class="empty">Impossible de charger les données.</p>'; return; }
  const rows = st.data || []; const v = rows[0];
  const ok = rows.filter((r) => r.acknowledged_at).length;
  $('adm').innerHTML = `
    <p class="lead-top">Seul l’administrateur voit cette page.${v ? ` Version en cours : <b>${v.version}</b> · ${esc(v.title)}.` : ''}</p>
    <div class="kpi"><div><b>${ok}/${rows.length}</b><span>ont lu et validé</span></div><div><b>${rows.length - ok}</b><span>à relancer</span></div></div>
    <div class="wrap"><table><thead><tr><th>Personne</th><th>Lecture validée</th><th>Compte</th></tr></thead><tbody>
      ${rows.map((r) => { const m = (mem.data || []).find((x) => x.id === r.member_id) || {};
        return `<tr><td><b>${esc(r.name)}</b>${r.role === 'admin' ? ' · admin' : ''}<br><small>${esc(r.email || 'e-mail à renseigner')}</small></td><td>${r.acknowledged_at ? `<span class="yes">Oui</span> · ${fmtDT(r.acknowledged_at)}` : '<span class="no">Pas encore</span>'}</td><td>${!m.user_id ? '<span class="no">Pas de compte</span>' : m.must_change_password ? 'Jamais connecté' : '<span class="yes">Actif</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="proc-sec"><h2>Publier une nouvelle version du process</h2>
      <p class="lead">À faire après une modification importante de l’Internal process : tout le monde devra le relire et le valider à nouveau.</p>
      <form class="newv" id="newv"><input id="nv-title" required placeholder="Ex. : Ajout de la fermeture du week-end" aria-label="Ce qui change"><button type="submit">Publier la version ${v ? v.version + 1 : 1}</button></form>
      <p class="err" id="nv-err"></p></div>`;
  $('newv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.from('process_versions').insert({ version: (v?.version || 0) + 1, title: 'Studio AccessFlow · ouverture & fermeture', summary: $('nv-title').value });
    if (error) { $('nv-err').textContent = 'Publication impossible.'; return; }
    load();
  });
}
load();
