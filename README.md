# Hold & Motion · outils de l’équipe

Site statique (HTML, CSS, JavaScript, sans étape de construction) branché sur Supabase (projet **Matrice-H&M**).

## Pages

| Page | Adresse | Contenu |
|---|---|---|
| Accueil | `/` | Tâches du jour : listes de rangement Studios A et B et Playback Solutions (cases Soir / Matin), tâches de la semaine selon le jour, infos clés avec photos |
| Internal process | `/process/` | Procédure d’ouverture et de fermeture expliquée, photos de référence. Chacun coche chaque partie lue puis valide : « J’ai lu, compris et je m’engage à respecter » |
| Historique | `/historique/` | Chaque cycle soir → matin, coché ou non, avec les noms |
| Admin | `/admin/` | Réservé à l’administrateur : qui a lu et validé quelle version, état des comptes, publication d’une nouvelle version du process |

## Fonctionnement de la liste du jour

- Un **cycle** = soir du jour J (fermeture) → matin du prochain jour ouvré (ouverture). Vendredi soir → lundi matin.
- La première case cochée d’une liste met automatiquement le nom de la personne connectée dans « Fait par » (modifiable).
- Quand toutes les cases et tous les noms sont remplis, le cycle est clôturé « Terminé » et la liste repart à zéro pour le soir.
- Un cycle non terminé est clôturé « Incomplet » le lendemain : rien n’est perdu, l’historique montre ce qui n’a pas été coché.
- Tâches de la semaine : poubelles (lun, mer, ven matin), recyclage (mardi matin), désodorisant (mar et ven matin), courses de l’espace commun (mardi, dans la journée).

## Organisation du code

```
index.html, process/, historique/, admin/   pages
assets/config.js       URL Supabase + clé publique
assets/core.js         client Supabase, connexion, 1re connexion (nouveau mot de passe), navigation
assets/photos.js       photos de référence, galerie, ajout / remplacement (Supabase Storage)
assets/checklist.js    liste du jour (cycles, cases, « Fait par »)
assets/procedure.js    contenu de l’Internal process (étapes d’ouverture / fermeture, planning)
assets/pages/*.js      script de chaque page
assets/photos/         photos d’origine
supabase/migrations/   schéma de la base, dans l’ordre (déjà appliqué)
```

## Supabase

Tables : `team_members` (nom, e-mail, compte, rôle `member`/`admin`), `studio_items`, `studio_cycles`, `studio_checks`, `studio_signs`, `studio_photos`, `process_versions`, `process_acks`.
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
