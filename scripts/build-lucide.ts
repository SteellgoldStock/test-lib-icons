import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "../src/lib.js";
import { generatePreview } from "./preview.js";

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);

const pixelMode = args.includes("--pixel");

const readOption = (
  name: string,
): string | undefined => {
  const inline = args.find((arg) =>
    arg.startsWith(`${name}=`),
  );

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);

  if (index !== -1) {
    return args[index + 1];
  }

  return undefined;
};

const limitValue = readOption("--limit");
const limit = limitValue
  ? Number(limitValue)
  : undefined;

if (limit !== undefined) {
  if (
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    console.error(
      "--limit must be an integer greater than 0.",
    );
    process.exit(1);
  }
}

const gridValue = readOption("--grid");
const grid = gridValue
  ? Number(gridValue)
  : 24;

if (
  !Number.isInteger(grid) ||
  grid < 8 ||
  grid > 128
) {
  console.error(
    "--grid must be an integer between 8 and 128.",
  );
  process.exit(1);
}

if (!pixelMode && gridValue) {
  console.warn(
    'Ignoring "--grid" because "--pixel" is not enabled.',
  );
}

const rasterThresholdValue = readOption(
  "--raster-threshold",
);

const rasterThreshold = rasterThresholdValue
  ? Number(rasterThresholdValue)
  : 0.16;

if (
  !Number.isFinite(rasterThreshold) ||
  rasterThreshold < 0 ||
  rasterThreshold > 1
) {
  console.error(
    "--raster-threshold must be a number between 0 and 1.",
  );
  process.exit(1);
}

if (!pixelMode && rasterThresholdValue) {
  console.warn(
    'Ignoring "--raster-threshold" because "--pixel" is not enabled.',
  );
}

const blockThresholdValue = readOption(
  "--block-threshold",
);

const blockThreshold = blockThresholdValue
  ? Number(blockThresholdValue)
  : 0.25;

if (
  !Number.isFinite(blockThreshold) ||
  blockThreshold < 0 ||
  blockThreshold > 1
) {
  console.error(
    "--block-threshold must be a number between 0 and 1.",
  );
  process.exit(1);
}

if (!pixelMode && blockThresholdValue) {
  console.warn(
    'Ignoring "--block-threshold" because "--pixel" is not enabled.',
  );
}

const blockValue = readOption("--block");
const block = blockValue
  ? Number(blockValue)
  : 2;

if (
  !Number.isInteger(block) ||
  block < 1 ||
  block > 8
) {
  console.error(
    "--block must be an integer between 1 and 8.",
  );
  process.exit(1);
}

if (!pixelMode && blockValue) {
  console.warn(
    'Ignoring "--block" because "--pixel" is not enabled.',
  );
}

const lucidePackage = "lucide-static";
const resvgPackage = "@resvg/resvg-js";
const pngPackage = "pngjs";

const sourceDir = path.join(
  root,
  "node_modules",
  lucidePackage,
  "icons",
);

const targetDir = path.join(
  root,
  "icons",
  "lucide",
);

const cleanTargetDirectory = async (): Promise<void> => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetDir);

  if (
    resolvedTarget === resolvedRoot ||
    !resolvedTarget.startsWith(
      `${resolvedRoot}${path.sep}`,
    )
  ) {
    throw new Error(
      `Refusing to clean unsafe directory: ${resolvedTarget}`,
    );
  }

  await fs.mkdir(resolvedTarget, {
    recursive: true,
  });

  const entries = await fs.readdir(
    resolvedTarget,
    {
      withFileTypes: true,
    },
  );

  for (const entry of entries) {
    const entryPath = path.join(
      resolvedTarget,
      entry.name,
    );

    await fs.rm(entryPath, {
      recursive: true,
      force: true,
    });
  }
};

const exists = async (
  filePath: string,
): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const installPackages = async (
  packages: string[],
): Promise<void> => {
  if (packages.length === 0) {
    return;
  }

  console.log(
    `Installing: ${packages.join(", ")}`,
  );

  if (process.platform === "win32") {
    await execFileAsync(
      "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        `pnpm add -D ${packages.join(" ")}`,
      ],
      {
        cwd: root,
      },
    );

    return;
  }

  await execFileAsync(
    "pnpm",
    [
      "add",
      "-D",
      ...packages,
    ],
    {
      cwd: root,
    },
  );
};

const ensureDependencies =
  async (): Promise<void> => {
    const missing: string[] = [];

    if (!(await exists(sourceDir))) {
      missing.push(lucidePackage);
    }

    if (pixelMode) {
      const resvgPath = path.join(
        root,
        "node_modules",
        "@resvg",
        "resvg-js",
        "package.json",
      );

      const pngPath = path.join(
        root,
        "node_modules",
        "pngjs",
        "package.json",
      );

      if (!(await exists(resvgPath))) {
        missing.push(resvgPackage);
      }

      if (!(await exists(pngPath))) {
        missing.push(pngPackage);
      }
    }

    await installPackages(missing);

    if (!(await exists(sourceDir))) {
      throw new Error(
        `Lucide icons directory not found: ${sourceDir}`,
      );
    }
  };

/**
 * Removes decorative roundness while keeping semantic
 * circles/arcs intact.
 *
 * - round line caps -> square
 * - round line joins -> miter
 * - rect rx/ry -> removed
 */
const removeRoundness = (
  svg: string,
): string => {
  let output = svg;

  output = output.replace(
    /stroke-linecap=(["'])round\1/gi,
    'stroke-linecap="square"',
  );

  output = output.replace(
    /stroke-linejoin=(["'])round\1/gi,
    'stroke-linejoin="miter"',
  );

  output = output.replace(
    /stroke-linecap\s*:\s*round/gi,
    "stroke-linecap:square",
  );

  output = output.replace(
    /stroke-linejoin\s*:\s*round/gi,
    "stroke-linejoin:miter",
  );

  output = output.replace(
    /\s(?:rx|ry)=(["'])[^"']*\1/gi,
    "",
  );

  return output;
};

type PixelMap = boolean[][];

type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const countNeighbors = (
  pixels: PixelMap,
  x: number,
  y: number,
): number => {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  let count = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;

      if (
        nx >= 0 &&
        nx < width &&
        ny >= 0 &&
        ny < height &&
        pixels[ny][nx]
      ) {
        count += 1;
      }
    }
  }

  return count;
};

const cleanPixelMap = (
  pixels: PixelMap,
): PixelMap => {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  const output = pixels.map((row) => [...row]);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[y][x]) {
        if (
          countNeighbors(pixels, x, y) === 0
        ) {
          output[y][x] = false;
        }

        continue;
      }

      const left =
        x > 0 &&
        pixels[y][x - 1];

      const right =
        x + 1 < width &&
        pixels[y][x + 1];

      const up =
        y > 0 &&
        pixels[y - 1][x];

      const down =
        y + 1 < height &&
        pixels[y + 1][x];

      if (
        (left && right) ||
        (up && down)
      ) {
        output[y][x] = true;
      }
    }
  }

  return output;
};

const snapToBlocks = (
  pixels: PixelMap,
  blockSize: number,
  blockThreshold: number,
): PixelMap => {
  if (blockSize <= 1) {
    return pixels;
  }

  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  const output: PixelMap = Array.from(
    { length: height },
    () => Array<boolean>(width).fill(false),
  );

  for (
    let blockY = 0;
    blockY < height;
    blockY += blockSize
  ) {
    for (
      let blockX = 0;
      blockX < width;
      blockX += blockSize
    ) {
      const blockWidth = Math.min(
        blockSize,
        width - blockX,
      );

      const blockHeight = Math.min(
        blockSize,
        height - blockY,
      );

      let activePixels = 0;
      let totalPixels = 0;

      for (
        let y = blockY;
        y < blockY + blockHeight;
        y += 1
      ) {
        for (
          let x = blockX;
          x < blockX + blockWidth;
          x += 1
        ) {
          totalPixels += 1;

          if (pixels[y][x]) {
            activePixels += 1;
          }
        }
      }

      const coverage =
        totalPixels > 0
          ? activePixels / totalPixels
          : 0;

      if (coverage < blockThreshold) {
        continue;
      }

      for (
        let y = blockY;
        y < blockY + blockHeight;
        y += 1
      ) {
        for (
          let x = blockX;
          x < blockX + blockWidth;
          x += 1
        ) {
          output[y][x] = true;
        }
      }
    }
  }

  return output;
};

const vectorizePixelMap = (
  pixels: PixelMap,
): PixelRect[] => {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  const visited = Array.from(
    { length: height },
    () => Array<boolean>(width).fill(false),
  );

  const rectangles: PixelRect[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        !pixels[y][x] ||
        visited[y][x]
      ) {
        continue;
      }

      let rectWidth = 1;

      while (
        x + rectWidth < width &&
        pixels[y][x + rectWidth] &&
        !visited[y][x + rectWidth]
      ) {
        rectWidth += 1;
      }

      let rectHeight = 1;

      while (
        y + rectHeight < height
      ) {
        let canExtend = true;

        for (
          let dx = 0;
          dx < rectWidth;
          dx += 1
        ) {
          if (
            !pixels[y + rectHeight][x + dx] ||
            visited[y + rectHeight][x + dx]
          ) {
            canExtend = false;
            break;
          }
        }

        if (!canExtend) {
          break;
        }

        rectHeight += 1;
      }

      for (
        let dy = 0;
        dy < rectHeight;
        dy += 1
      ) {
        for (
          let dx = 0;
          dx < rectWidth;
          dx += 1
        ) {
          visited[y + dy][x + dx] = true;
        }
      }

      rectangles.push({
        x,
        y,
        width: rectWidth,
        height: rectHeight,
      });
    }
  }

  return rectangles;
};

const pixelizeSvg = async (
  svg: string,
  targetGrid: number,
  blockSize: number,
  rasterThreshold: number,
  blockThreshold: number,
): Promise<string> => {
  const {
    Resvg,
  } = await import("@resvg/resvg-js");

  const {
    PNG,
  } = await import("pngjs");

  // Supersampling keeps the initial Lucide silhouette
  // recognizable before snapping it to the low-res grid.
  const supersample = 4;

  const renderSize =
    targetGrid * supersample;

  const normalizedSvg = removeRoundness(svg)
    .replaceAll(
      "currentColor",
      "#ffffff",
    );

  const renderer = new Resvg(
    normalizedSvg,
    {
      fitTo: {
        mode: "width",
        value: renderSize,
      },
    },
  );

  const pngBuffer = renderer
    .render()
    .asPng();

  const png = PNG.sync.read(pngBuffer);

  const pixels: PixelMap = Array.from(
    { length: targetGrid },
    () =>
      Array<boolean>(targetGrid).fill(false),
  );

  // Coverage threshold:
  // low enough to preserve thin Lucide strokes,
  // high enough to avoid most anti-aliasing fuzz.
  for (
    let gridY = 0;
    gridY < targetGrid;
    gridY += 1
  ) {
    for (
      let gridX = 0;
      gridX < targetGrid;
      gridX += 1
    ) {
      let alpha = 0;
      let samples = 0;

      for (
        let sy = 0;
        sy < supersample;
        sy += 1
      ) {
        for (
          let sx = 0;
          sx < supersample;
          sx += 1
        ) {
          const px =
            gridX * supersample + sx;

          const py =
            gridY * supersample + sy;

          if (
            px >= png.width ||
            py >= png.height
          ) {
            continue;
          }

          const index =
            (py * png.width + px) * 4;

          alpha +=
            png.data[index + 3] / 255;

          samples += 1;
        }
      }

      const coverage =
        samples > 0
          ? alpha / samples
          : 0;

      pixels[gridY][gridX] =
        coverage >= rasterThreshold;
    }
  }

  const cleanedPixels =
    cleanPixelMap(pixels);

  const snappedPixels =
    snapToBlocks(
      cleanedPixels,
      blockSize,
      blockThreshold,
    );

  const rectangles =
    vectorizePixelMap(snappedPixels);

  const body = rectangles
    .map(
      (rect) =>
        `  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" />`,
    )
    .join("\n");

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${targetGrid}"
  height="${targetGrid}"
  viewBox="0 0 ${targetGrid} ${targetGrid}"
  fill="currentColor"
  shape-rendering="crispEdges"
>
${body}
</svg>
`;
};

const convertIcons =
  async (): Promise<number> => {
    await cleanTargetDirectory();

    const files = (
      await fs.readdir(sourceDir)
    )
      .filter((file) =>
        file
          .toLowerCase()
          .endsWith(".svg"),
      )
      .sort((a, b) =>
        a.localeCompare(b),
      );

    const targetFiles = limit
      ? files.slice(0, limit)
      : files;

    if (files.length === 0) {
      throw new Error(
        `No SVG files found in ${sourceDir}`,
      );
    }

    let converted = 0;
    const totalToConvert = targetFiles.length;
    const wasLimitApplied = limit !== undefined;

    if (wasLimitApplied) {
      console.log(
        `Limit enabled: generating ${totalToConvert}/${files.length} icons.`,
      );
    }

    for (const file of targetFiles) {
      const sourcePath = path.join(
        sourceDir,
        file,
      );

      const targetPath = path.join(
        targetDir,
        file,
      );

      const svg = await fs.readFile(
        sourcePath,
        "utf8",
      );

      const convertedSvg = pixelMode
        ? await pixelizeSvg(
            svg,
            grid,
            block,
            rasterThreshold,
            blockThreshold,
          )
        : removeRoundness(svg);

      await fs.writeFile(
        targetPath,
        convertedSvg,
        "utf8",
      );

      converted += 1;

      if (
        converted % 100 === 0 ||
        converted === totalToConvert
      ) {
        console.log(
          `Converted ${converted}/${totalToConvert}`,
        );
      }
    }

    return converted;
  };

  const main = async (): Promise<void> => {
  console.log(
    pixelMode
      ? `Building pixelized Lucide icon set (${grid}x${grid}, block ${block}, raster threshold ${rasterThreshold}, block threshold ${blockThreshold})...`
      : "Building squared Lucide icon set...",
  );

  console.log("");
  console.log(`Root:   ${root}`);
  console.log(`Source: ${sourceDir}`);
  console.log(`Target: ${targetDir}`);
  console.log("");

  await ensureDependencies();

  const converted =
    await convertIcons();

  console.log("");

  console.log(
    `Converted ${converted} Lucide icons.`,
  );

  console.log(
    `Mode: ${
      pixelMode
        ? `pixel (${grid}x${grid}, block ${block}, raster threshold ${rasterThreshold}, block threshold ${blockThreshold})`
        : "square"
    }`,
  );

  console.log(
    `Output: ${targetDir}`,
  );

  console.log("");
  console.log("Generating preview...");

  await generatePreview(targetDir);

  console.log("");
  console.log("Done.");
};

main().catch(
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
