---
description: Finalise une user story mobile validée (demande de fusion vers develop, puis la livraison)
---

# /ship-feature

Finalise une story qui a passé la phase Validate.

## Pré-requis, vérifiés avant tout

- Branche courante `feature/US-XX-<slug>`.
- `code-reviewer` a écrit `APPROUVÉ` dans `reviews/US-XX-<slug>-review.md`.
- `validateur` a enregistré `Verdict tests : VERTS` dans `reviews/US-XX-<slug>-validation.md`, **avec la trace du passage du client** : les cases cochées, la date, et ce qui n'allait pas. Une validation sans cette trace n'en est pas une.

Si l'un des trois manque, afficher ce qui manque et **refuser** de continuer.

## Séquence

1. **Revérifier la machine** :
   ```bash
   cd mobile-app && npx tsc --noEmit && npm run lint
   ```
   Si l'un échoue, afficher l'erreur et renvoyer vers `/validate-feature`.

2. **Vérifier qu'aucun secret ne part** :
   ```bash
   grep -rn "SERVICE_ROLE\|service_role" mobile-app --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" | grep -v node_modules
   git check-ignore -q .env.local && echo ".env.local ignoré" || echo "ATTENTION : .env.local n'est pas ignoré"
   ```
   Un seul résultat sur la première commande, et on s'arrête : la clé `service_role` est extractible du binaire livré sur les stores. Si elle a été commitée, elle doit être **révoquée et remplacée** dans Supabase, pas seulement retirée du code.

3. **Mettre à jour les documents de la story** : la section « Historique » de la spec, du plan et du zoning porte la date et l'état final. Commit : `docs(US-XX): historique de la story`.

4. **Pousser** : `git push -u origin feature/US-XX-<slug>`.

5. **Ouvrir la demande de fusion** vers `develop` (MCP `github`, ou `gh pr create`) :
   - titre : `[US-XX] <titre de la story>` ;
   - corps : ce que la story fait, les liens vers `specs/`, `plans/`, `design/` et les deux fichiers de `reviews/`, et la liste que le client a cochée, avec sa date.

6. Afficher : « Demande de fusion ouverte : <adresse>. Fusionne dans `develop` après relecture. »

## Et la livraison ?

Fusionner dans `develop` ne publie rien. Une version se livre avec l'agent **`soumission`**, qui enchaîne les skills de livraison du parcours (`ottho-controle-avant-envoi` d'abord, puis la première livraison iPhone ou Android, l'envoi à Apple, la publication Android, ou `ottho-nouvelle-version` pour une version suivante).

Il demande ton **accord explicite avant chaque action payante ou sortante** : une build en nuage, un dépôt sur TestFlight ou sur une piste Play, une mise en vente. Un accord vaut pour une action, pas pour la suite.

## Règles

- Jamais de demande de fusion vers `main` : toujours vers `develop`.
- Jamais de `git push --force`.
- Aucune build, aucun envoi, aucune publication depuis cette commande : c'est le travail de `soumission`, avec ton accord.
