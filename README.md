# Pixel Icon AI

An experimental TypeScript playground for generating SVG icons with OpenAI while preserving the visual language of an existing pixel-style icon set.

This repository started as a small experiment to explore whether embeddings and SVG references could help an AI model generate new icons that remain visually consistent with an existing collection.

> [!NOTE]
> This is an experimental project, not a production-ready icon library. It contains various scripts, generated assets, tests, and explorations created while experimenting with AI-assisted icon generation.

## How It Works

The generation pipeline follows a retrieval-augmented approach:

```text
Icon request
    ↓
Embedding
    ↓
Cosine similarity search
    ↓
Closest existing SVG references
    ↓
OpenAI model
    ↓
Generated SVG
```

Embeddings are not used to generate the icon itself.

They are used to identify the existing icons that are semantically closest to the requested icon. The corresponding SVG files are then provided to the generation model as visual and structural references.

This helps the model reproduce characteristics such as:

- pixel-oriented geometry
- visual weight
- spacing
- proportions
- SVG structure
- icon complexity
- overall consistency with the existing set

## Requirements

- Node.js
- pnpm
- OpenAI API key

## Installation

```bash
pnpm install
cp .env.example .env
```

Add your OpenAI API key:

```env
OPENAI_API_KEY=sk-...
```

The generation model can also be configured through:

```env
OPENAI_GENERATION_MODEL=your-model
```

## Build the Icon Index

The `icons/` directory acts as the source collection.

Generate the icon metadata index with:

```bash
pnpm index
```

This creates:

```text
data/icons.json
```

with metadata for each SVG.

## Generate Embeddings

```bash
pnpm embed
```

Embeddings are stored directly inside:

```text
data/icons.json
```

They only need to be regenerated when the indexed icon metadata changes.

## Semantic Search

You can inspect which existing icons are considered the closest references to a request:

```bash
pnpm icon:search "folder protected by a PIN"
```

Example output:

```text
0.82  folder
0.79  lock
0.74  folder-open
...
```

This is useful for debugging the retrieval stage independently from SVG generation.

## Generate an Icon

```bash
pnpm generate "folder protected by a PIN"
```

The generator:

1. Embeds the request.
2. Finds the closest icons using cosine similarity.
3. Loads their SVG source.
4. Sends those references to the configured OpenAI model.
5. Requests a new SVG following the same visual language.
6. Validates the generated SVG.
7. Writes it to `output/`.

Generated files are stored in:

```text
output/
```

## Preview

A simple HTML preview can be generated for a directory containing SVG files:

```bash
pnpm preview ./output
```

or:

```bash
pnpm preview ./icons
```

The preview provides a quick way to visually compare generated icons with the reference collection.

## SVG Conventions

The original reference set primarily uses a compact pixel-oriented SVG grid.

The generator attempts to preserve characteristics such as:

- crisp geometry
- integer-aligned coordinates where possible
- `currentColor`
- limited or no rounded geometry
- consistent visual weight
- simple SVG markup

These constraints evolved throughout the experiments in this repository and may vary between generated assets.

## Experimental Scripts

The repository also contains utility and experimental scripts used while exploring different approaches, including:

- rebuilding the icon index
- renaming and normalizing icon files
- semantic icon search
- HTML preview generation
- SVG generation
- experiments with converting existing icon sets

Not every script should be considered part of a stable API.

## Why This Repository Exists

The goal was mostly to answer a simple question:

> Can an AI generate new SVG icons that actually look like they belong to an existing icon family?

The project evolved into experiments involving embeddings, semantic retrieval, SVG references, prompt engineering, automated previews, naming normalization, and transformations of existing icon libraries.

It is intentionally kept public as a record of those experiments.

## Disclaimer

Generated icons may require manual review or editing.

AI-generated SVG output can be inconsistent, especially for complex geometry, curves, overlapping shapes, or highly constrained pixel-art compositions.

This repository should therefore be treated as a playground and reference implementation rather than a finished icon-generation system.