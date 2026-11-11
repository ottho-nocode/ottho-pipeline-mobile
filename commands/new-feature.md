---
description: Démarre un cycle SDD mobile pour une nouvelle user story (branche + Specify + Plan)
---

# /new-feature

Démarre les phases **Specify** et **Plan** du cycle SDD mobile pour une nouvelle user story.

**Argument** : `$ARGUMENTS` = titre court de la story, entre guillemets.

## Avant de commencer

Vérifie que le projet est prêt :

- `docs/vision.md` et `docs/PRD.md` existent (sinon, le cadrage du projet n'est pas fait : lance `brainstorming` puis `spec-writer` au niveau projet) ;
- `docs/base.md` existe et ses tables sont cochées. C'est le relevé de la base Supabase **existante** de l'application web du client, écrit par `architect` en la lisant. Sans lui, une story qui lit des données ne peut pas être planifiée ;
- on n'est pas déjà sur une branche `feature/*` : une seule story à la fois.

## Séquence

1. **Numéroter la story** : lister `specs/US-*.md`, prendre le plus grand numéro + 1, sur deux chiffres (`US-01`, `US-02`…).
2. **Slugifier le titre** : minuscules, tirets, sans accents. « Liste des chantiers » devient `liste-des-chantiers`.
3. **Créer la branche** :
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/US-XX-<slug>
   ```
4. **Phase Specify** :
   - si le cadrage de la story manque, invoquer `brainstorming` sur elle : quel usage en mobilité, et ce que le téléphone apporte ici ;
   - invoquer `spec-writer` pour écrire `specs/US-XX-<slug>.md`. Il traduit la story web vers le mobile sur cinq points : navigation, gestes, états hors-ligne, interruptions, droit d'accès ;
   - si la story a des écrans, invoquer `designer`. Il délègue à la skill `brief-to-zoning-mobile`, dont l'audit à 13 contrôles **bloque le recap** tant qu'un manquement subsiste (zones de 44 points, 5 onglets au plus, 2 niveaux au plus, aucun écran sans sortie, aucun écran de données sans état vide, aucun tableau conservé en tableau, aucun geste web sans traduction tactile).
5. **STOP** : affiche « Phase Specify terminée. Relis la spec et le zoning, valide-les, puis tape GO PLAN. »
6. **Sur GO PLAN** : invoquer `architect`. Il **ne conçoit aucun schéma** : la base existe, il la lit. Son plan porte sur l'arbre Expo Router (segments de groupe compris), les écrans et leurs états, `app.config.ts` évaluable en JS pur, les profils `eas.json`, les identifiants iOS et Android, et la frontière des credentials.
7. **STOP** : affiche « Phase Plan terminée. Relis le plan, valide-le, puis tape GO IMPLEMENT. »
8. **Sur GO IMPLEMENT** : invoquer `developer`, avec la spec, le plan, le zoning et `docs/base.md` en contexte.

À la fin de l'implémentation, `/validate-feature` ouvre la phase Validate.

## Règles

- Une seule story en cours à la fois.
- Validation humaine obligatoire entre Specify, Plan et Implement.
- Aucune action destructrice sans confirmation explicite.
- Les réponses déjà consignées dans les « Questions ouvertes » des livrables priment sur toute hypothèse : transmets-les aux agents, ne les laisse pas redemander.
