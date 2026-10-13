# Hold & Motion · outils de l’équipe

Site statique (HTML, CSS, JavaScript, sans étape de construction) branché sur Supabase (projet **Matrice-H&M**).

## Pages

| Page | Adresse | Qui | Contenu |
|---|---|---|---|
| Accueil | `/` | tous | Tâches du jour (une case par tâche) et listes de rangement Studios A et B / Playback Solutions (cases Soir et Matin) |
| Internal process | `/process/` | tous | Procédure d’ouverture et de fermeture, photos. Lecture par partie puis validation « lu, compris, je m’engage à respecter » |
| Historique | `/historique/` | admin | Qui a coché quoi et quand, tâches faites ou non, journal de toutes les coches **et décoches** |
| Admin | `/admin/` | admin | Lectures validées, état des comptes, nouvelle version du process |

Une cloche en haut à droite signale les notifications non lues (process à lire et valider).

## Fonctionnement

- Chaque case enregistre le compte qui l’a cochée. Une décoche est aussi enregistrée (journal), pour repérer les erreurs.
- **Listes de rangement** : un cycle = soir du jour J → matin du prochain jour ouvré (vendredi soir → lundi matin). Quand tout est coché, le cycle est clôturé et la liste repart à zéro ; un cycle oublié est clôturé « Incomplet » le lendemain.
- **Tâches du jour** : selon le jour de la semaine (poubelles lun/mer/ven matin, recyclage mardi matin, désodorisant bureau et studio mar/ven matin, mise à jour de la liste de courses et courses le mardi dans la journée).

## Modifier le contenu (administrateur)

Bouton **« Modifier la page »** en haut à droite (Accueil et Internal process) :
- cliquer sur un texte pour le corriger (Entrée pour valider) ; × pour masquer une ligne, ↺ pour la réafficher ;
- listes de rangement et tâches : modifier, supprimer, monter/descendre, ajouter (jours et moment pour une tâche) — appliqué dès aujourd’hui et pour la suite, l’historique ne change pas ;
- étapes d’ouverture / fermeture : modifier le texte, la précision, l’alerte, supprimer, déplacer, ajouter.
Le code de la porte s’écrit `{door_code}` dans une étape ; sa valeur est dans la table `studio_info` (clé `door_code`).

## Organisation du code

```
index.html, process/, historique/, admin/   pages
assets/config.js       URL Supabase + clé publique
assets/core.js         client Supabase, connexion, 1re connexion (nouveau mot de passe), navigation
assets/photos.js       photos de référence, galerie, ajout / remplacement (Supabase Storage)
assets/checklist.js    listes de rangement soir / matin
assets/daytasks.js     tâches du jour
assets/edit.js         mode édition (admin)
assets/procedure.js    contenu de l’Internal process (étapes d’ouverture / fermeture, planning)
assets/pages/*.js      script de chaque page
assets/photos/         photos d’origine
supabase/migrations/   schéma de la base, dans l’ordre (déjà appliqué)
```

## Supabase

Tables : `team_members` (nom, e-mail, compte, rôle `member`/`admin`), `studio_items` (points et tâches), `studio_cycles`, `studio_checks`, `studio_days`, `studio_day_checks`, `check_log` (journal), `process_steps`, `site_texts`, `studio_info`, `studio_photos`, `process_versions`, `process_acks`.
Vues : `studio_history_items` (une ligne par point attendu et par cycle, coché ou non), `process_read_status` (lecture du process, visible par l’admin seulement).
Stockage : bucket privé `studio-photos`.

Règles d’accès (RLS) : seul un compte rattaché à une ligne active de `team_members` lit et écrit. Les e-mails et les validations de lecture des autres ne sont visibles que par l’administrateur. La clé publique de `assets/config.js` est faite pour être visible.

### Ajouter une personne

1. Supabase › Authentication › Users › **Add user** › e-mail + mot de passe provisoire, cocher « Auto Confirm User ».
2. SQL Editor :
   ```sql
   insert into team_members (name, email, user_id, role)
   select 'Prénom', email, id, 'member' from auth.users where email = 'prenom@exemple.fr';
   ```
3. Lui donner l’adresse du site et son mot de passe provisoire : il en choisira un nouveau à la 1re connexion.

Retirer quelqu’un : `update team_members set active = false where name = 'Prénom';` (l’historique est conservé).

### Réglages recommandés dans Supabase

- Authentication › Sign In / Providers : désactiver **Allow new users to sign up** (les comptes sont créés par l’admin).
- Authentication › URL Configuration : mettre l’adresse du site (GitHub Pages puis le domaine).

### Modifier les listes

Table `studio_items` : `label`, `phases` (`{soir,matin}`), `weekdays` (1 = lundi … 7 = dimanche), `active`. Le changement s’applique au cycle suivant.
Après une modification importante du process : page Admin › **Publier une nouvelle version** → tout le monde doit relire et valider.

## Mise en ligne

GitHub Pages : Settings › Pages › Source « Deploy from a branch » › `main` / `(root)` → `https://holdandmo.github.io/matrice/`.

Domaine plus tard : ajouter un fichier `CNAME` (ex. `outils.holdandmotion.fr`), créer l’enregistrement DNS CNAME vers `holdandmo.github.io`, puis mettre à jour l’URL dans Supabase › Authentication › URL Configuration.

## En local

```
python3 -m http.server 8000
```
puis http://localhost:8000/
