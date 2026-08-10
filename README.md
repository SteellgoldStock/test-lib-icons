# Pixel Icon AI

Pipeline TypeScript local pour générer de nouveaux SVG dans le style des 56 icônes fournies.

## Fonctionnement

`demande -> embedding -> recherche cosine -> 8 SVG proches -> modèle OpenAI -> nouveau SVG`

Les embeddings servent à sélectionner les bonnes références. Le style visuel est reproduit à partir du SVG complet des références envoyé au modèle.

## Installation

```bash
pnpm install
cp .env.example .env
```

Ajoute ta clé dans `.env` :

```env
OPENAI_API_KEY=sk-...
```

## 1. Créer les embeddings

```bash
pnpm embed
```

Ils sont sauvegardés dans `data/icons.json`.

## 2. Tester la recherche

```bash
pnpm search "folder protected by a PIN"
```

## 3. Générer

```bash
pnpm generate "folder protected by a PIN"
```

Le résultat arrive dans `output/`.

## Important

La librairie fournie utilise une grille SVG 24x24. Le générateur conserve donc le 24x24 pour rester fidèle à la DA.

Les descriptions de `data/icons.json` ont été déduites automatiquement des noms de fichiers. Tu peux les améliorer manuellement pour augmenter la qualité de la recherche. Après modification, remets `embedding` à `null` sur les entrées concernées puis relance `pnpm embed`.

Le modèle de génération est configurable avec `OPENAI_GENERATION_MODEL`.
