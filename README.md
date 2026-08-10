# Pixel Icon AI

An experimental TypeScript playground for generating, retrieving, transforming, previewing, and testing SVG icon systems.

The project originally started as a small experiment around AI-assisted SVG generation: could an OpenAI model generate new icons while preserving the visual language of an existing pixel-style collection?

It gradually evolved into a broader icon experimentation toolkit with semantic search, embeddings, SVG generation, automatic previews, icon indexing, naming normalization, and Lucide-to-pixel conversion experiments.

> [!NOTE]
> This repository is intentionally experimental.
> It is not a production-ready icon library and should be treated as a playground, research project, and collection of utilities.

---

## Features

### AI-assisted SVG generation

Generate new SVG icons from natural-language descriptions:

```bash
pnpm generate "folder protected by a PIN"
```

The generator retrieves visually relevant references from the existing icon collection before asking the configured OpenAI model to generate a new SVG.

---

### Semantic icon retrieval

Each indexed icon can be embedded using OpenAI embeddings.

A request is embedded and compared against the icon collection using cosine similarity:

```text
Request
   ↓
Embedding
   ↓
Cosine similarity
   ↓
Closest existing icons
   ↓
SVG references
   ↓
Generation model
```

Embeddings are used only for retrieval.

They do not directly generate or modify SVG geometry.

---

### Icon index generation

The `icons/` directory acts as the source of truth for the reference collection.

Rebuild the metadata index with:

```bash
pnpm index
```

This generates:

```text
data/icons.json
```

Each entry contains information such as:

```json
{
  "name": "folder-open",
  "description": "Pixel-art interface icon representing folder open.",
  "tags": [
    "folder",
    "open"
  ],
  "file": "icons/folder-open.svg",
  "embedding": null
}
```

---

### OpenAI embeddings

Generate embeddings for the icon collection:

```bash
pnpm embed
```

Embeddings are stored directly inside:

```text
data/icons.json
```

They do not need to be regenerated unless the indexed metadata changes.

---

### Semantic search

Inspect which icons are selected as references for a request:

```bash
pnpm icon:search "folder protected by a PIN"
```

Example:

```text
0.82  folder
0.79  lock
0.74  folder-open
0.68  shield
```

This is useful for debugging retrieval independently from generation.

---

### SVG preview

Generate an interactive HTML preview for any directory containing SVG files:

```bash
pnpm preview ./output
```

or:

```bash
pnpm preview ./icons
```

The preview includes:

- live icon search
- icon count
- configurable display size
- 16 px
- 24 px
- 32 px
- 48 px
- SVG copy button
- SVG download button
- automatic SVG rendering

The default preview size is 32 px.

---

## AI Generation Pipeline

The generation workflow is approximately:

```text
Natural-language request
        ↓
OpenAI embedding
        ↓
Cosine similarity search
        ↓
Closest SVG references
        ↓
OpenAI generation model
        ↓
Generated icon name
        ↓
SVG validation
        ↓
output/*.svg
        ↓
Preview regeneration
```

Example:

```bash
pnpm generate \
  "File combined with a magnifying glass representing file search"
```

Possible output:

```text
output/file-search.svg
```

Generated icon names are normalized to short semantic kebab-case names.

Examples:

```text
FolderOpen      → folder-open
FileSearch      → file-search
FullscreenExit  → fullscreen-exit
VolumeMute      → volume-mute
```

---

## Lucide Experiments

The repository also contains experiments around automatically transforming Lucide icons into more angular or pixel-oriented variants.

The goal is not to replace Lucide's semantic design language, but to investigate how an existing vector icon set can be transformed into a different visual system automatically.

### Build Lucide-derived icons

```bash
pnpm lucide:build
```

The script automatically installs the required Lucide package if necessary.

The generated files are written to:

```text
icons/lucide/
```

---

## Square Lucide Mode

The basic transformation removes decorative roundness from Lucide SVGs.

For example:

```svg
stroke-linecap="round"
stroke-linejoin="round"
```

becomes:

```svg
stroke-linecap="square"
stroke-linejoin="miter"
```

Rounded rectangle properties such as:

```svg
rx="2"
ry="2"
```

are also removed.

Semantic circles and curves are intentionally preserved in this mode.

---

## Pixel Mode

Lucide icons can also be rasterized onto a logical grid and reconstructed as SVG pixel geometry:

```bash
pnpm lucide:build --pixel
```

The pipeline is roughly:

```text
Lucide SVG
   ↓
Roundness normalization
   ↓
Supersampled rasterization
   ↓
Alpha coverage analysis
   ↓
Boolean pixel map
   ↓
Optional cleanup
   ↓
Grid quantization
   ↓
Rectangle merging
   ↓
SVG reconstruction
```

The resulting SVGs are made from crisp geometric blocks rather than smooth Bézier curves.

---

## Pixelization Options

### Grid size

```bash
--grid
```

Controls the logical raster grid.

Example:

```bash
pnpm lucide:build \
  --pixel \
  --grid 24
```

Supported experimental values include:

```text
24
32
48
```

Lucide itself is primarily designed around a 24×24 coordinate system, so 24 is generally the most natural baseline.

---

### Block size

```bash
--block
```

Controls the logical pixel block size.

Examples:

```bash
--block 1
--block 2
--block 3
```

Conceptually:

```text
block 1 → maximum detail
block 2 → larger pixel rhythm
block 3 → aggressive simplification
```

Larger values produce stronger pixel-art characteristics but can remove important details.

---

### Raster threshold

```bash
--raster-threshold
```

Controls how much rendered alpha coverage is required before a raster cell becomes active.

Example:

```bash
--raster-threshold 0.20
```

Lower values preserve more pixels.

Higher values produce thinner and cleaner silhouettes.

---

### Block threshold

```bash
--block-threshold
```

Controls how much active coverage a logical block needs before the entire block becomes active.

Example:

```bash
--block-threshold 0.30
```

This is mainly useful when using block sizes greater than `1`.

---

### Limit

```bash
--limit
```

Limits how many Lucide icons are processed.

This is useful when experimenting with pixelization settings without rebuilding the entire icon set.

Example:

```bash
pnpm lucide:build \
  --pixel \
  --limit 30
```

---

## Current Pixel Preset

One of the best-performing experimental presets found during testing is:

```bash
pnpm lucide:build \
  --pixel \
  --grid 24 \
  --block 1 \
  --raster-threshold 0.20 \
  --block-threshold 0.30
```

For faster testing:

```bash
pnpm lucide:build \
  --pixel \
  --grid 24 \
  --block 1 \
  --raster-threshold 0.20 \
  --block-threshold 0.30 \
  --limit 30
```

This configuration preserves most of Lucide's recognizable silhouettes while introducing a significantly more pixel-oriented rendering.

---

## Requirements

- Node.js
- pnpm
- OpenAI API key for AI generation and embeddings

Some experimental scripts automatically install additional dependencies when required.

---

## Installation

```bash
pnpm install
cp .env.example .env
```

Add your OpenAI API key:

```env
OPENAI_API_KEY=sk-...
```

The models can be configured through environment variables:

```env
OPENAI_GENERATION_MODEL=your-model
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

---

## Typical Workflow

### Rebuild the source index

```bash
pnpm index
```

### Generate embeddings

```bash
pnpm embed
```

### Inspect semantic retrieval

```bash
pnpm icon:search "fullscreen exit"
```

### Generate a new icon

```bash
pnpm generate \
  "Four corner brackets pointing inward representing exit fullscreen"
```

### Preview generated icons

```bash
pnpm preview ./output
```

---

## SVG Conventions

The experiments generally aim for:

- compact SVG markup
- `currentColor`
- crisp rendering
- integer-aligned coordinates where practical
- limited decorative roundness
- recognizable silhouettes
- consistent visual weight
- small coordinate grids
- simple geometric construction

AI-generated icons do not always respect every constraint perfectly and should be manually reviewed.

---

## Project Structure

A simplified project structure looks like:

```text
.
├── data/
│   └── icons.json
│
├── icons/
│   ├── *.svg
│   └── lucide/
│       └── *.svg
│
├── output/
│   └── *.svg
│
├── scripts/
│   ├── build-index.ts
│   ├── build-lucide.ts
│   ├── embed.ts
│   ├── generate.ts
│   ├── preview.ts
│   ├── rename-icons.ts
│   └── search.ts
│
├── src/
│   └── lib.ts
│
└── preview.html
```

The exact structure may change as experiments are added or removed.

---

## Experimental Utilities

The repository currently includes or has included experiments around:

- AI SVG generation
- OpenAI embeddings
- cosine similarity search
- semantic SVG retrieval
- generated icon naming
- kebab-case normalization
- icon index rebuilding
- bulk SVG renaming
- HTML previews
- live preview search
- configurable preview sizes
- SVG copy/download actions
- Lucide SVG ingestion
- automatic dependency installation
- removal of rounded line caps and joins
- rounded rectangle normalization
- SVG rasterization
- configurable pixel grids
- logical pixel blocks
- anti-aliasing thresholds
- SVG reconstruction from raster data
- limited test builds

Not every utility should be considered stable.

---

## Why This Repository Exists

The original question was simple:

> Can an AI generate new SVG icons that actually look like they belong to an existing icon family?

That experiment quickly expanded into several related questions:

> Can embeddings select better visual references?

> Can SVG structure itself be used as style context?

> Can naming and previews be automated?

> Can an existing icon system such as Lucide be transformed into a pixel-oriented visual language programmatically?

This repository is intentionally public as a record of those experiments.

Some ideas work surprisingly well.

Others look terrible.

That is part of the point.

---

## Disclaimer

This repository is a playground, not a finished icon library.

AI-generated and automatically transformed SVGs may contain:

- inconsistent geometry
- excessive simplification
- poor curves
- lost details
- awkward proportions
- semantic ambiguity

Generated assets should be manually reviewed before being used in production.

The Lucide transformation experiments are derivative transformations of an existing open-source icon set. If those experiments are redistributed, the relevant upstream license and attribution requirements must be preserved.