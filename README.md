# OM Suivi

OM Suivi est une application de suivi du personnel : pointage des services, heures supplémentaires, demandes de congés, rapports et gestion administrative.

## Stack

- Next.js 15.5 / React 18 / TypeScript
- Firebase Authentication, Cloud Firestore et Cloud Storage
- Firebase Functions v2 (Google Calendar OAuth)
- PWA avec service worker
- Internationalisation française et anglaise (next-intl)

## Prérequis

- Node.js 24 et npm
- Java 21 pour exécuter les émulateurs Firebase
- Un projet Firebase configuré (le projet par défaut est défini dans .firebaserc)

## Développement local

```bash
npm install
npm run dev
```

L'application démarre sur http://localhost:9002.

## Vérifications

```bash
npm run typecheck
npm run build
npm run test:rules
```

Les tests de sécurité doivent être exécutés avec les émulateurs Firestore et Storage :

```bash
npx --yes firebase-tools@15.35.0 emulators:exec --only firestore,storage --project demo-om-suivi "npm run test:rules"
```

La suite vérifie les accès aux profils, l'élévation de privilèges, la modification des données de paie, les demandes de congé et les justificatifs Storage.

## Firebase Functions

```bash
npm --prefix functions install
npm --prefix functions run build
```

Google Calendar OAuth utilise les variables suivantes dans l'environnement Firebase Functions :

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI

Copier functions/.env.example vers functions/.env.studio-3929362902-1f7dc, puis renseigner les valeurs depuis Google Cloud Console et Firebase. GOOGLE_REDIRECT_URI doit correspondre à l'URL réelle de la fonction authGoogleCallback après son déploiement. Ne jamais committer un fichier .env rempli.

## Règles et déploiement Firebase

Les fichiers de règles actifs sont déclarés dans firebase.json :

- firestore.rules
- storage.rules

Avant toute opération de déploiement, vérifier le projet Firebase actif avec firebase use et confirmer qu'il s'agit du bon environnement. Les commandes suivantes modifient les services Firebase distants :

```bash
npx --yes firebase-tools@15.35.0 deploy --only firestore:rules,storage
npx --yes firebase-tools@15.35.0 deploy --only functions
```

Ne pas lancer ces commandes depuis une branche de travail sans validation explicite du déploiement.

## Vercel

Le projet utilise le preset Next.js standard. La commande de build est npm run build. Le contrôle GitHub Actions vérifie le typage, le build de production, la compilation Functions et les règles Firebase. Un build réussi ne remplace pas les tests fonctionnels ni la vérification des variables OAuth et du projet Firebase cible.
