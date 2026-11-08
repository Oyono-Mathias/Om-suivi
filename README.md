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

## Sécurité du pointage et de la paie

- À la création d'un pointage actif, le serveur fixe la date et l'heure de départ ; les valeurs fournies par le navigateur ne font pas autorité.
- Le salarié envoie une demande d'arrêt horodatée. Une Cloud Function fixe l'heure de fin et recalcule la durée payable et les heures supplémentaires à partir du profil, du planning et de la pause configurée.
- Les entrées manuelles sont identifiées comme telles ; leurs durées sont recalculées côté serveur. Le salarié ne peut ni écrire les durées de paie, ni modifier lui-même sa profession ou déclarer un jour férié.
- Les modifications et suppressions des historiques de pointage restent réservées aux administrateurs.

## Firebase Functions

```bash
npm --prefix functions install
npm --prefix functions run build
npm --prefix functions run test:attendance
```

Google Calendar OAuth utilise Google Secret Manager en production. Définir les secrets avant le déploiement :

```bash
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set GOOGLE_REDIRECT_URI
```

GOOGLE_REDIRECT_URI doit correspondre à l'URL réelle de la fonction authGoogleCallback. Le fichier functions/.env.example est réservé aux émulateurs locaux ; ne pas utiliser de fichier .env pour stocker les identifiants de production et ne jamais committer de secret.

Ordre de mise en service obligatoire pour éviter de laisser des anciens jetons lisibles dans les profils :

1. Définir les trois secrets puis déployer les Functions : `firebase deploy --only functions`.
2. Se connecter avec un compte administrateur, ouvrir **Profil → Intégrations**, puis lancer une seule fois **Migrer les anciens jetons Google**. Vérifier le nombre déplacé dans le message de confirmation.
3. Après la migration, déployer les règles : `firebase deploy --only firestore:rules,storage`.

La callable `migrateGoogleCalendarTokens` déplace les anciens jetons de `/users/{uid}` vers `/googleCalendarTokens/{uid}`. Les règles clientes refusent ensuite tout accès à cette collection privée et aux états OAuth.

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
