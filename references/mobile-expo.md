# Pièges Expo du pipeline mobile

Les règles de ce fichier ne sont pas déduites : chacune a déjà coûté une build, une session de
débogage ou un bug livré. Elles valent mieux que n'importe quelle règle réinventée au moment
d'écrire le code.

Pile du pipeline mobile : **Expo, React Native, Expo Router, NativeWind, Supabase**. L'application
ne crée aucun backend, elle se branche sur la base Supabase existante de l'application web du
client.

Les agents `developer`, `architect` et `code-reviewer` s'appuient sur ce fichier
(`${CLAUDE_PLUGIN_ROOT}/references/mobile-expo.md`).

## 1. `app.config.ts` doit rester évaluable en JS pur

EAS Build **exécute** `app.config.ts`, et tout ce qu'il importe, sur un runtime Node, pendant sa
phase « Read app config ». La syntaxe propre à TypeScript y est invalide :

- `import type { … }` ;
- les annotations de paramètre et de retour (`(ctx: ConfigContext): ExpoConfig`) ;
- les conversions `as`.

Tout cela marche en local avec `npm run ios`, et **fait échouer la build EAS sur un
`"Read app config" UNKNOWN_ERROR`** qui ne dit pas pourquoi. Le piège est documenté et a déjà coûté
une build.

À faire :

```js
// @ts-nocheck
const expoConfig = (ctx) => ({
  ...ctx.config,
  name: "…",
  slug: "…",
});
export default expoConfig;
```

Dans les fichiers de configuration qu'il importe, les conversions passent par JSDoc, **parenthèses
comprises** :

```js
/** @type {string[]} */ ([...])
```

Les parenthèses sont obligatoires. Vérifie que le formateur ne les a pas retirées.

`eas.json` épingle la version de Node dans un profil `base` partagé, pour que l'évaluation de la
configuration soit reproductible d'une build à l'autre.

## 2. Metro sur un port explicite quand une autre application Expo peut tourner

```bash
npx expo start --port 8082
```

Deux applications Expo sur 8081 se servent mutuellement le mauvais bundle, sans erreur visible.

## 3. Les modules natifs ne marchent pas dans Expo Go

Stripe, l'achat intégré et « Se connecter avec Apple » demandent une **build de développement**
(`npm run ios`, ou un profil `development`). Ne déclare jamais un paiement ou une authentification
native vérifiés depuis Expo Go : ils y sont désactivés.

## 4. La barre d'onglets est native : l'OS possède sa surface

La barre du bas utilise **`NativeTabs` de `expo-router/unstable-native-tabs`**
(`app/(app)/(tabs)/_layout.tsx`) : une vraie barre d'onglets du système, pas le rendu JS de `Tabs`.

- **Ne mets pas de `backgroundColor` dessus** : la couleur et la translucidité appartiennent à l'OS.
- Teinte seulement l'élément actif, avec `tintColor` (lu dans les couleurs du thème), et la police
  de l'étiquette.
- Les icônes sont des SF Symbols (`sf="house"`) côté iOS, plus un `drawable` côté Android, pas des
  icônes d'une bibliothèque JS.

C'est pour cette raison que la barre d'onglets est hors de la liste des surfaces thémées à la main
de la règle suivante.

## 5. Une seule source de vérité pour les couleurs : `lib/theme.ts`

Jamais de valeur hexadécimale en dur pour une surface thémée.

- Pour les classes Tailwind, les jetons sémantiques : `bg-background`, `text-foreground`, `bg-brand`.
- Pour les API natives qui ne prennent pas de `className`, lis `const { colors } = useTheme()` et
  passe `colors.<jeton>` : `contentStyle` d'un `Stack`, `StatusBar`, la couleur d'un
  `ActivityIndicator`, `placeholderTextColor`, un `stroke` de SVG.

**Modifier seulement les jetons Tailwind ne suffit pas** : les surfaces natives thémées gardent
l'ancienne couleur. Bug réel : un thème sombre avec une barre d'onglets restée blanche.

Les seules couleurs littérales admises sont les contrastes fixes voulus : bouton Apple noir sur
blanc, texte ou icône sur une image pleine largeur, badge coloré.

## 6. `KeyboardAvoidingView` sur le conteneur extérieur de l'écran

Tout écran qui porte un `TextInput` garde **les champs et leur bouton d'envoi** visibles au-dessus
du clavier.

```jsx
<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
```

Il se place sur le **conteneur extérieur de l'écran ou du panneau du bas**, jamais enterré dans un
composant de formulaire imbriqué : un `KeyboardAvoidingView` placé dans un enfant positionné en
absolu ou en flex **ne soulève rien**. Bug réel : un panneau de connexion resté derrière le clavier
parce que le composant était dans le formulaire au lieu de l'écran.

Pour un formulaire long, enveloppe les champs dans un `ScrollView` avec
`keyboardShouldPersistTaps="handled"`, pour que l'appui sur le bouton compte encore clavier ouvert.

## 7. Les segments de groupe font partie des chemins de navigation

Un écran en `app/(flow)/paywall.tsx` s'atteint par :

```jsx
href="/(flow)/paywall"
```

Un `/paywall` nu **échoue en silence** : rien ne se passe, aucune erreur. Écris toujours le chemin
complet, groupes compris.

## 8. L'ordre des providers dans `app/_layout.tsx`

Gestes, analytics, Stripe, **client Supabase**, store d'authentification, safe area, thème, puis le
routeur.

Le créneau du client backend est le **provider Supabase** : ce pipeline n'a pas d'autre backend, et
rien ne délègue ce choix à un autre fichier de règles. `ThemeProvider` se place à l'intérieur de
`SafeAreaProvider`, enveloppe le routeur, et porte le fond thémé et la `StatusBar`.

## 9. Ce qui ne sort jamais du serveur

Une application livrée sur les stores est un binaire qu'on ouvre : tout ce qui est embarqué en sort,
y compris derrière une condition jamais vraie.

- Seule la clé **anon ou publishable** est embarquée (`EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- La clé `service_role` **ne touche jamais** le code de l'application, pas même pour un test. Une
  opération qui demande des droits élevés vit dans une fonction Edge ou dans le backend web, et
  l'application l'appelle.
- La **RLS est la seule frontière réelle** entre les données des utilisateurs : chaque table lue par
  l'application a ses policies vérifiées avant la première build.

## Vérification

```bash
cd mobile-app && npx tsc --noEmit     # changement sensible aux types
cd mobile-app && npm run lint         # interface partagée, ou beaucoup de fichiers
```

La vérification à l'écran est celle du client, sur son propre téléphone : QR code `npm run expo-go`
pour l'interface, la navigation, les états et la connexion par e-mail ; build interne (profil
`development` ou `preview`) pour l'achat intégré et la connexion sociale, qu'Expo Go désactive.
Ni simulateur iOS, ni émulateur Android : le client ne doit avoir ni Mac ni émulateur.
