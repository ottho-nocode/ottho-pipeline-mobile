# Design

> Système visuel d'Ottho Builder Mobile, l'interface `web/` (thèmes sombre et clair Ottho). Les
> valeurs vivent dans `web/src/styles.css`. Repris d'Ottho Builder 2 (`ottho-code-app/builder`),
> dont il garde les jetons, la coquille et les règles de sens.

## Visual Theme

Deux thèmes, **sombre** (défaut si le système est sombre) et **clair**, basculés par le bouton
« Clair / Sombre » de la barre du haut (choix mémorisé dans le navigateur, posé avant le premier
rendu par `index.html`). Identité Ottho « spectacle » dosée pour un outil de lecture : le dégradé
chaud orange-rouge pour la marque et pour ce qui attend l'élève, le violet pour ce qui se clique, un
bleu pour ce qui est en cours, un vert pour ce qui est fait.

Scène d'usage : un débutant complet, souvent le soir sur son portable, la vue ouverte par le plugin
à côté de son terminal Claude Code. Il lit ; il répond et enregistre dans le terminal.

## Color

Mêmes jetons que Builder 2, en sombre (`:root[data-theme="dark"]`) et en clair
(`:root[data-theme="light"]`) ; aucune couleur n'est écrite en dur dans les règles.

| Rôle | Token |
|---|---|
| Fond | `--bg` / `--bg-deep` |
| Surfaces | `--surface-1..3` |
| Traits | `--line` / `--line-soft` |
| Texte | `--text` / `--text-2` / `--muted` / `--faint` |
| Marque, à toi d'agir (chaud) | `--warm-1..3`, `--warm-grad` |
| Actions, boutons (violet) | `--act-1`, `--act-2`, `--act-grad`, `--act-tint` |
| En cours (bleu) | `--run` |
| Fait (vert) | `--ok` |
| Bloqué (rouge) | `--ko` |

Règle de sens : violet = on peut cliquer ; chaud = marque, étape courante, et ce qui attend l'élève ;
bleu = en cours ; vert = fait ; rouge = bloqué. **Jamais la couleur seule** : chaque état porte une
pastille et son mot (« faite », « en cours », « bloquée », « sautée », « selon tes réponses »).

## Typography

- UI : Inter Variable (`@fontsource-variable/inter`).
- Données, identifiants, chemins, heures, durées : JetBrains Mono 400/500/600.
- Étiquettes de section (`.eyebrow`) : mono 11px, capitales, interlettrage 0.1em, orange chaud.
- Échelle : 11 / 12 / 13 / 14 (base) / 15 / 19. Titres en 650, interlettrage négatif léger.

## Layout

- Coquille pleine hauteur (100vh, rien ne défile au niveau de la page) : barre du haut ; colonne de
  gauche 32 % (ce qui t'attend, défile seule) ; zone de droite : bandeau, chemin (hauteur restante),
  journal (24vh).
- Barre du haut : marque, nom du projet, branche Git, état du lien (« en direct »), boutons Documents
  (▤), Journal (◷), thème. Sous 1480 px, les boutons ne gardent que leur icône.
- Colonne de gauche réglable : poignée sur sa bordure (glisser, double-clic, flèches au clavier,
  de 300 px à la largeur qui laisse 560 px au chemin) et bouton « ‹ » pour la fermer. Fermée, elle
  devient une barre de 44 px (« › », nombre d'éléments en attente, « À faire » vertical).
- Rayons : 8 / 12 / 16 px ; pastilles en cercle de 20 px.

## Components

- **Le chemin** : les cinq actes empilés, reliés par un filet vertical ; chaque acte porte son rang
  dans une pastille posée sur le filet, son nom, son compte « 3 faites sur 8 » et sa barre
  d'avancement. L'acte de l'étape courante est déplié et bordé de chaud ; les autres se replient en
  une ligne de pastilles. Le repli choisi est mémorisé dans le navigateur.
- **Carte d'étape** : pastille, numéro en mono, titre, état en toutes lettres, durée. Une étape faite
  montre sa preuve (préfixée « Preuve : », en vert) ; une étape bloquée ou sautée sa raison (en
  chaud) ; une étape à faire son but. L'étape courante prend la bordure chaude en dégradé et l'ombre
  du bandeau. Une étape que le Builder ne connaît pas porte « nouvelle étape du parcours ».
- **Étapes écartées** : sous un filet pointillé, en bas de leur acte, titrées « Selon tes réponses,
  ces étapes ne te concernent pas », légèrement estompées. Elles sortent des totaux.
- **Pastilles** : ✓ fait (vert), ◉ en cours (bleu), ▲ bloqué (rouge), ○ à faire, ⊘ sauté (trait
  tireté), ◌ écarté (trait pointillé). Décoratives (`aria-hidden`) : le texte à côté porte le sens.
- **Carte « Ton étape »** (colonne de gauche) : acte et numéro en mono chaud, titre, but, état,
  durée, bouton violet « Copier « /ottho » », et le rappel « une étape par conversation ».
- **Fiche d'étape** (colonne de gauche, au clic) : numéro, titre, état, preuve en encadré vert ou
  raison en encadré rouge, condition pour une étape écartée, description de la skill, puis « Lire la
  fiche de l'étape » qui charge le `SKILL.md` à la demande et l'affiche en Markdown.
- **Ta fabrication** (colonne de gauche) : ce que la fabrication Expo embarquera, une valeur par
  ligne. Toute valeur encore celle du modèle est encadrée en chaud et marquée « encore celle du
  modèle », avec une alerte en tête : fabriquer maintenant enverrait l'application sous l'identité de
  quelqu'un d'autre.
- **Tes choix** : les branches du produit en toutes lettres (« iPhone : oui »), jamais une coche
  seule, avec la note qui dit qu'elles décident des étapes.
- **Bandeau** : bord en dégradé (chaud pour l'étape courante, rouge pour un blocage, vert pour la
  fin), étiquette « Ton étape » en mono, titre cliquable, et le prompt à copier.
- **Notifications du terminal** : au-dessus du bandeau, même cadre à bord chaud. Questions de Claude
  numérotées, ou autorisation en attente. Elles disparaissent dès que la personne a répondu.
- **Journal** : l'historique d'`ottho.json`, du plus récent au plus ancien, avec la pastille de
  l'état, la preuve ou la raison ; en tête, l'agent qui travaille, s'il y en a un.

## Motion

150 à 250 ms, courbe ease-out (`--ease`). Les barres d'avancement glissent, le reste ne bouge pas au
repos. Tout est coupé si le système demande moins de mouvement.
