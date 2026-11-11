---
description: Ouvre la phase Validate d'une user story mobile (revue de code, puis la liste à cocher sur ton téléphone)
---

# /validate-feature

Ouvre la phase **Validate** de la story en cours. Deux agents, dans cet ordre.

## Pré-requis

- Branche courante `feature/US-XX-<slug>`.
- `developer` a fini son implémentation et commité.

## Séquence

1. **Invoquer `code-reviewer`.** Il audite la diff avec `develop`, en lecture seule. Deux de ses contrôles sont durs, et un manquement sur l'un des deux suffit à refuser :
   - **aucune clé `service_role` dans le bundle** : l'application livrée sur les stores est un binaire qu'on ouvre. Si la clé a été commitée, il ne suffit pas de la retirer : elle doit être **révoquée et remplacée** dans Supabase ;
   - **RLS vérifiée sur chaque table lue par l'application** : avec une clé publique dans un binaire distribué, tout ce que la RLS autorise est accessible. C'est la seule frontière réelle entre les données des utilisateurs.

   Il écrit `reviews/US-XX-<slug>-review.md` et finit par `APPROUVÉ` ou `CORRECTIONS REQUISES`.

2. **Si `CORRECTIONS REQUISES`** : STOP. Afficher les corrections, et renvoyer vers `developer`. Ne lance pas `validateur` : inutile de faire essayer au client un code qui va changer.

3. **Si `APPROUVÉ`** : invoquer `validateur`. Il fait deux choses :
   - **ce que la machine prouve** : `cd mobile-app && npx tsc --noEmit`, `npm run lint`, une build EAS qui passe, et la lecture de ses journaux. La build consomme des crédits : il demande ton accord avant de la lancer ;
   - **la liste écran par écran que tu coches sur ton propre téléphone**. C'est là que vivent désormais les critères Given-When-Then de la spec. Il écrit `reviews/US-XX-<slug>-validation.md`.

4. **Essayer sur ton téléphone.** Deux façons, selon ce qui est vérifié :
   - **QR code `npm run expo-go`** : suffit pour l'interface, la navigation, les états, le backend et la connexion par e-mail ;
   - **build interne** (profil `development` ou `preview`, déjà en `distribution: internal`) : obligatoire pour l'**achat intégré** et la **connexion sociale**, qu'Expo Go désactive. Les points concernés portent la mention `(build interne)`.

   Ni simulateur iOS, ni émulateur Android, ni job Maestro, ni Expo Simulator : le client n'a besoin ni d'un Mac ni d'un émulateur.

5. **Enregistrer ton verdict.** Dis à `validateur` ce qui va et ce qui ne va pas : il l'inscrit dans le fichier de validation, avec la date. **Sans cette trace, la phase Validate n'est pas vérifiable** : une case cochée sans date ne prouve rien.

6. Son verdict final est `Verdict tests : VERTS` ou `Verdict tests : ROUGES`. Tant que tu n'as pas essayé, c'est `ROUGES` : une story non essayée n'est pas une story validée.

## Règles

- Aucun point n'est déclaré vérifié sans l'avoir été, ni par la machine, ni par toi.
- Un point en échec repart chez `developer`, pas chez `validateur`.
- Accord explicite avant toute build (crédits) et toute action sortante.
- `code-reviewer` et `validateur` ne corrigent jamais le code applicatif.
