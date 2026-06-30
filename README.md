# Frontend — déploiement sur GitHub Pages

Page statique qui se connecte à votre projet Supabase. Aucun serveur à faire tourner.

## Prérequis
Avoir d'abord mis en place la base Supabase (voir `../GUIDE.md` et les fichiers SQL).
Récupérer dans Supabase → Settings → API : la **Project URL** et la **clé anon public**.

## Étape 1 — Renseigner config.js
Ouvrir `config.js` et remplacer les deux valeurs :
```js
window.SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
window.SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_PUBLIQUE";
```
La clé **anon** est publique par conception : la sécurité est assurée par les règles RLS de
la base. Elle peut donc figurer dans un dépôt public sans risque.
(Au besoin, ajustez aussi `EMAIL_DOMAIN`, par défaut `debauche.local`.)

## Étape 2 — Mettre en ligne sur GitHub Pages
1. Créer un dépôt GitHub et y déposer les 4 fichiers de ce dossier à la racine :
   `index.html`, `config.js`, `app.js`, `style.css`.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : Deploy from a branch**,
   choisir la branche `main` et le dossier `/ (root)`, puis **Save**.
3. Au bout d'une minute, l'URL publique apparaît :
   `https://VOTRE-COMPTE.github.io/NOM-DU-DEPOT/`. C'est l'adresse à partager.

Le dépôt peut être **public** (la clé anon est faite pour être publique). GitHub Pages sur
dépôt privé nécessite un compte payant.

## Utilisation
- **Commerciaux / consultation** : ouvrir l'URL → bouton **« Consulter (lecture seule) »**.
  Aucun compte nécessaire.
- **Opérateurs / superviseurs** : se connecter avec leur **prénom** + mot de passe
  (le domaine e-mail est ajouté automatiquement). Chacun peut changer son mot de passe via
  le bouton « Mot de passe ».
- La gestion des comptes/rôles se fait dans le tableau de bord Supabase.

## Bon à savoir
- Les requêtes du navigateur vers Supabase fonctionnent depuis n'importe quel domaine
  (l'API Supabase autorise les origines par défaut) : rien à configurer côté CORS.
- Chart.js et la librairie Supabase sont chargés via CDN (jsDelivr) ; une connexion
  Internet est nécessaire — de toute façon indispensable pour joindre Supabase.
- Pour une mise à jour de l'app (futurs modules), il suffit de remplacer les fichiers dans
  le dépôt : GitHub Pages se met à jour automatiquement.
