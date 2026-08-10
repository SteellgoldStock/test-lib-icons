import fs from "node:fs/promises";
import path from "node:path";
import {
  client,
  findNearest,
  generationModel,
  readSvg,
  root,
} from "../src/lib.js";
import { generatePreview } from "./preview.js";

const args = process.argv.slice(2);
const fileArgIndex = args.indexOf("--file");

const filePath =
  fileArgIndex === -1
    ? null
    : args[fileArgIndex + 1];

if (fileArgIndex !== -1 && !filePath) {
  console.error("Usage: pnpm generate --file ./icons-to-generate.txt");
  process.exit(1);
}

const request =
  fileArgIndex === -1
    ? args.join(" ").trim()
    : "";

const requests =
  fileArgIndex === -1
    ? request
      ? [request]
      : []
      // @ts-ignore
    : (await fs.readFile(filePath, "utf8"))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

if (requests.length === 0) {
  console.error(
    fileArgIndex === -1
      ? 'Usage: pnpm generate "empty favorites list"'
      : "Usage: pnpm generate --file ./icons-to-generate.txt",
  );

  process.exit(1);
}

type Reference = Awaited<ReturnType<typeof findNearest>>[number];

type GenerateResult = {
  name: string;
  outputPath: string;
  refs: Reference[];
};

const instructions = `You are an expert icon designer specialized in production-ready SVG pixel icon systems.

Your task is to generate a single SVG icon that feels like a native member of the supplied reference icon library.

## PRIMARY OBJECTIVE

Study and reproduce the visual language of the supplied reference icons.

The generated icon must match their:

- pixel density
- stroke and shape weight
- proportions
- spacing
- negative space
- visual balance
- silhouette complexity
- corner treatment
- level of abstraction
- optical alignment
- pixel rhythm

Do not merely create a generic pixel-art interpretation of the requested concept. The result must look as though it was designed by the same icon designer and belongs to the exact same icon family.

## CANVAS

The base icon canvas is exactly 24×24.

Required root attributes:

- viewBox="0 0 24 24"
- width="24"
- height="24"

The icon must be designed specifically for this grid.

Do not create a larger design and scale it down.

## PIXEL GEOMETRY

Treat the 24×24 canvas as a strict pixel-design grid.

Mandatory rules:

- use crisp orthogonal geometry
- strongly prefer integer coordinates
- construct shapes from horizontal, vertical and 45° stepped pixel segments
- use discrete pixel steps instead of smooth diagonals
- use square corners
- use square line endings
- maintain consistent pixel thickness
- preserve deliberate empty pixels between distinct elements
- optimize the silhouette for readability at exactly 24×24

The icon must remain clearly recognizable when rendered at its native 24×24 size.

## STRICTLY FORBIDDEN

Never use:

- rounded corners
- rx or ry
- circles unless the reference library explicitly represents them through pixelated geometry
- ellipses
- Bézier curves
- SVG arc commands
- smooth vector curves
- anti-aliased-looking geometry
- fractional coordinates unless absolutely necessary to reproduce the reference system
- filters
- gradients
- masks
- clip paths
- raster images
- embedded images
- text
- transforms
- CSS classes
- inline styles
- unnecessary groups
- decorative details inconsistent with the reference library

Do not simulate pixel art by drawing a conventional smooth SVG icon and placing it on a 24×24 canvas.

The geometry itself must be pixel-native.

## SVG CONSTRUCTION

Use the simplest valid SVG structure possible.

Prefer:

- <path>
- <rect>
- simple polygons when appropriate

Use currentColor for visible geometry.

Do not hardcode white, black or any other display color.

Keep the SVG clean, minimal and production-ready.

Remove:

- metadata
- comments
- editor-specific attributes
- redundant attributes
- invisible geometry
- unnecessary wrappers

## VISUAL CONSISTENCY

Before producing the final SVG, internally compare the proposed icon against the supplied references.

Check:

1. Does its silhouette have comparable visual weight?
2. Are its occupied and empty areas consistent with the library?
3. Are details represented with the same level of abstraction?
4. Are diagonals represented using compatible pixel stair-stepping?
5. Does it use a similar internal spacing rhythm?
6. Is it visually centered rather than merely mathematically centered?
7. Does it remain readable at 24×24?
8. Would it look natural when displayed directly beside the reference icons?

If not, redesign it before returning the result.

Do not explain this analysis.

## ICON NAMING

You must independently choose a canonical name for the icon.

The user's description explains the desired semantic concept. It is not necessarily the desired filename.

Naming rules:

- use lowercase kebab-case
- usually 1 to 3 words
- keep the name short
- describe semantic purpose rather than visual construction
- prefer terminology commonly used by established icon libraries
- no "icon" suffix
- no library or project prefix
- no redundant words
- avoid unnecessarily literal descriptions
- avoid sentence-like filenames

Examples:

"Two vertical bars representing media playback pause"
→ "pause"

"Solid square representing stop playback"
→ "stop"

"Folder combined with a right-facing movement arrow"
→ "folder-move"

"File combined with a magnifying glass"
→ "file-search"

"Four corners pointing inward"
→ "fullscreen-exit"

"Counter-clockwise seek symbol with number 10"
→ "skip-back-10"

The canonical name should be suitable directly as:

<name>.svg

## OUTPUT CONTRACT

Return exactly two fields and nothing else:

NAME: <canonical-kebab-case-name>
SVG:
<svg ...>...</svg>

Do not use Markdown fences.

Do not provide explanations, notes, alternatives, commentary or design reasoning.

## ICON REQUEST

The actual icon request is provided in the user input.`;

const generateFromRequest = async (
  requestText: string,
): Promise<GenerateResult> => {
  const refs = await findNearest(requestText, 8);

  const referenceText = (
    await Promise.all(
      refs.map(async (icon) => {
        const svg = await readSvg(icon.file);

        return `REFERENCE: ${icon.name}
${svg}`;
      }),
    )
  ).join("\n\n");

  const response = await client.responses.create({
    model: generationModel,
    instructions,
    input: `NEW ICON REQUEST:
${requestText}

CLOSEST LIBRARY REFERENCES:
${referenceText}`,
  });

  const result = response.output_text.trim();

  const nameMatch = result.match(/^NAME:\s*([a-z0-9-]+)\s*$/m);
  const svgMatch = result.match(/<svg\b[\s\S]*?<\/svg>/i);

  if (!nameMatch) {
    throw new Error("Model did not return a valid icon name.");
  }

  if (!svgMatch) {
    throw new Error("Model did not return an SVG.");
  }

  const name = nameMatch[1];
  const svg = svgMatch[0].trim();

  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) {
    throw new Error("Model did not return standalone SVG.");
  }

  if (!/viewBox=["']0 0 24 24["']/.test(svg)) {
    throw new Error('SVG must use viewBox="0 0 24 24".');
  }

  if (!/width=["']24["']/.test(svg)) {
    throw new Error('SVG must use width="24".');
  }

  if (!/height=["']24["']/.test(svg)) {
    throw new Error('SVG must use height="24".');
  }

  if (
    /<(text|image|filter|linearGradient|radialGradient|mask|foreignObject|clipPath|circle|ellipse)\b/i.test(
      svg,
    )
  ) {
    throw new Error("SVG contains a forbidden element.");
  }

  if (/\b(?:rx|ry|transform|filter|mask|clip-path|style|class)=/i.test(svg)) {
    throw new Error("SVG contains a forbidden attribute.");
  }

  if (
    /\b(?:fill|stroke)=["'](?!currentColor\b|none\b)[^"']+["']/i.test(svg)
  ) {
    throw new Error(
      'SVG colors must use "currentColor" or "none".',
    );
  }

  const outputDir = path.join(root, "output");
  const outputPath = path.join(outputDir, `${name}.svg`);

  await fs.mkdir(outputDir, {
    recursive: true,
  });

  try {
    await fs.access(outputPath);

    throw new Error(
      `Icon "${name}" already exists: ${outputPath}`,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }

  await fs.writeFile(outputPath, `${svg}\n`, "utf8");

  return {
    name,
    outputPath,
    refs,
  };
};

if (fileArgIndex === -1) {
  const requestText = requests[0];
  const result = await generateFromRequest(requestText);

  await generatePreview();

  console.log("");
  console.log(`Generated: ${result.outputPath}`);
  console.log(`Name: ${result.name}`);
  console.log("");
  console.log("References:");

  for (const ref of result.refs) {
    console.log(`- ${ref.name} (${ref.score.toFixed(4)})`);
  }
} else {
  const total = requests.length;
  const successes: GenerateResult[] = [];
  const failures: Array<{
    description: string;
    error: string;
  }> = [];

  for (let index = 0; index < requests.length; index += 1) {
    const description = requests[index];
    const position = index + 1;

    console.log(`[${position}/${total}] Generating...`);

    try {
      const result = await generateFromRequest(description);

      successes.push(result);

      console.log(`→ ${path.basename(result.outputPath)} ✓`);

      await generatePreview();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      failures.push({
        description,
        error: message,
      });

      console.log(`→ ERROR: ${message} ✗`);
    }
  }

  if (successes.length > 0) {
    await generatePreview();
  }

  console.log("");
  console.log("Batch completed");
  console.log(`✓ ${successes.length} generated`);
  console.log(`✗ ${failures.length} failed`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failed:");

    for (const failure of failures) {
      console.log(
        `- ${failure.description}: ${failure.error}`,
      );
    }
  }
}