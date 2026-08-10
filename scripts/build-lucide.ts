import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "../src/lib.js";
import { generatePreview } from "./preview.js";

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);

const pixelMode = args.includes("--pixel");
const inPlace = args.includes("--in-place");
const checkMode = args.includes("--check");
const fixMode = args.includes("--fix");

const pixelizationEnabled =
  pixelMode || (checkMode && fixMode);

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

const normalizeFileName = (
  value: string,
): string => {
  const trimmed = value.trim();

  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    throw new Error(
      `Invalid SVG filename: ${trimmed}. Use plain filenames only.`,
    );
  }

  const hasSvgExtension = /\.svg$/i.test(
    trimmed,
  );

  return hasSvgExtension
    ? trimmed
    : `${trimmed}.svg`;
};

const parseFilesList = (
  value: string,
): string[] => {
  return value
    .split(",")
    .map((name) =>
      normalizeFileName(name),
    )
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
};

const uniqueByLowerCase = (
  values: string[],
): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.toLowerCase();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(value);
  }

  return unique;
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

if (!pixelizationEnabled && gridValue) {
  console.warn(
    'Ignoring "--grid" because "--pixel" is not enabled.',
  );
}

const rasterThresholdValue = readOption(
  "--raster-threshold",
);

const rasterThreshold = rasterThresholdValue
  ? Number(rasterThresholdValue)
  : 0.2;

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

if (!pixelizationEnabled && rasterThresholdValue) {
  console.warn(
    'Ignoring "--raster-threshold" because "--pixel" is not enabled.',
  );
}

const blockThresholdValue = readOption(
  "--block-threshold",
);

const blockThreshold = blockThresholdValue
  ? Number(blockThresholdValue)
  : 0.3;

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

if (!pixelizationEnabled && blockThresholdValue) {
  console.warn(
    'Ignoring "--block-threshold" because "--pixel" is not enabled.',
  );
}

const blockValue = readOption("--block");
const block = blockValue
  ? Number(blockValue)
  : 1;

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

if (!pixelizationEnabled && blockValue) {
  console.warn(
    'Ignoring "--block" because "--pixel" is not enabled.',
  );
}

const lucidePackage = "lucide-static";
const resvgPackage = "@resvg/resvg-js";
const pngPackage = "pngjs";

const userSourceDir = readOption("--path");
const requestedFile = readOption("--file");
const requestedFiles = readOption("--files");

const sourceDir = userSourceDir
  ? path.resolve(process.cwd(), userSourceDir)
  : path.join(
      root,
      "node_modules",
      lucidePackage,
      "icons",
    );

const targetDir = userSourceDir && !inPlace
  ? path.join(
      path.dirname(sourceDir),
      `${path.basename(sourceDir)}-pixelized`,
    )
  : sourceDir;

const defaultOutputDir = path.join(
  root,
  "icons",
  "lucide",
);

const outputDir = userSourceDir
  ? targetDir
  : defaultOutputDir;

const resolvedSourceDir = path.resolve(sourceDir);
const resolvedOutputDir = path.resolve(outputDir);

if (!inPlace && resolvedOutputDir === resolvedSourceDir) {
  throw new Error(
    "Output directory resolves to the source directory. Use --in-place to overwrite source SVG files.",
  );
}

const safeDirectoryCheck = (
  directory: string,
): void => {
  const resolvedRoot = path.resolve(root);
  const resolvedDirectory = path.resolve(directory);
  const resolvedSource = path.resolve(sourceDir);

  if (
    resolvedDirectory === resolvedRoot ||
    resolvedDirectory === resolvedSource
  ) {
    throw new Error(
      `Refusing to clean unsafe directory: ${resolvedDirectory}`,
    );
  }
};

const cleanTargetDirectory = async (
  target: string,
): Promise<void> => {
  if (target === sourceDir) {
    return;
  }

  safeDirectoryCheck(target);

  const resolvedTarget = path.resolve(target);

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

const isDirectory = async (
  directoryPath: string,
): Promise<boolean> => {
  try {
    const info = await fs.stat(directoryPath);
    return info.isDirectory();
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

    if (!userSourceDir && !(await exists(sourceDir))) {
      missing.push(lucidePackage);
    }

    if (pixelizationEnabled) {
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

    if (!(await isDirectory(sourceDir))) {
      throw new Error(
        `Source directory not found: ${sourceDir}`,
      );
    }
  };

const listSourceSvgs = async (): Promise<string[]> => {
  const files = await fs.readdir(sourceDir);

  return files
    .filter((file) =>
      file.toLowerCase().endsWith(".svg")
    )
    .sort((a, b) => a.localeCompare(b));
};

const readOriginalFromGit = async (
  fileName: string,
): Promise<string> => {
  const sourcePath = path.join(
    sourceDir,
    fileName,
  );

  const relativePath = path.relative(
    root,
    sourcePath,
  );

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Cannot read original from git: ${fileName} is outside repository root (${root}).`,
    );
  }

  const gitRef = `HEAD:${relativePath}`;

  const result = await execFileAsync(
    "git",
    ["show", gitRef],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  return result.stdout as string;
};

const resolveRequestedFiles = (
  requested: string[],
  sourceFiles: string[],
): string[] => {
  const sourceByName = new Map<string, string>();

  for (const sourceFile of sourceFiles) {
    sourceByName.set(
      sourceFile.toLowerCase(),
      sourceFile,
    );
  }

  return requested
    .map((filename) =>
      sourceByName.get(filename.toLowerCase()),
    )
    .filter(
      (
        filename,
      ): filename is string => Boolean(filename),
    );
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

type PixelizeResult = {
  svg: string;
  fallbackUsed: boolean;
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
  file?: string,
): Promise<PixelizeResult> => {
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

  if (rectangles.length === 0) {
    console.warn(
      `[fallback] ${file ?? "icon"} produced no pixel geometry; preserving squared source SVG.`,
    );

    return {
      svg: removeRoundness(svg),
      fallbackUsed: true,
    };
  }

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

const hasGeometryElements = (
  svg: string,
): boolean => {
  return /<\s*(?:path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*>/i.test(
    svg,
  );
};

type ConvertSummary = {
  pixelized: number;
  fallback: number;
  skipped: number;
};

const convertIcons =
  async (
    files: string[],
    totalSourceCount?: number,
  ): Promise<ConvertSummary> => {
  await cleanTargetDirectory(outputDir);

  if (files.length === 0) {
    throw new Error(
      `No SVG files found in ${sourceDir}`,
    );
  }

    let processed = 0;
    let converted = 0;
    let pixelizedCount = 0;
    let fallbackCount = 0;
    let skippedCount = 0;
    const totalToConvert = files.length;
    const wasLimitApplied =
      totalSourceCount !== undefined &&
      totalSourceCount !== files.length;

    if (wasLimitApplied) {
      console.log(
        `Limit enabled: generating ${totalToConvert}/${totalSourceCount} icons.`,
      );
    }

    for (const file of files) {
      const sourcePath = path.join(
        sourceDir,
        file,
      );

      const targetPath = path.join(
        outputDir,
        file,
      );

      const svg = await fs.readFile(
        sourcePath,
        "utf8",
      );

      const result = pixelMode
        ? await pixelizeSvg(
            svg,
            grid,
            block,
            rasterThreshold,
            blockThreshold,
            file,
          )
        : {
            svg: removeRoundness(svg),
            fallbackUsed: false,
          };

      const finalSvg = result.svg;
      const hasGeometry =
        hasGeometryElements(finalSvg);

      if (!hasGeometry) {
        console.error(
          `[skip] ${file} produced an invalid SVG with no supported geometry; preserving source.`,
        );

        skippedCount += 1;
      } else {
        await fs.writeFile(
          targetPath,
          finalSvg,
          "utf8",
        );

        converted += 1;

        if (result.fallbackUsed) {
          fallbackCount += 1;
        } else {
          pixelizedCount += 1;
        }
      }

      processed += 1;

      if (
        processed % 100 === 0 ||
        processed === totalToConvert
      ) {
        console.log(
          `Converted ${processed}/${totalToConvert}`,
        );
      }
    }

    return {
      pixelized: pixelizedCount,
      fallback: fallbackCount,
      skipped: skippedCount,
    };
  };

  const main = async (): Promise<void> => {
  console.log(
    `Source: ${sourceDir}`,
  );

  console.log("");
  console.log(
    `Output: ${
      inPlace ? "in-place" : outputDir
    }`,
  );

  await ensureDependencies();

  const files = await listSourceSvgs();

  if (files.length === 0) {
    throw new Error(
      `No SVG files found in ${sourceDir}`,
    );
  }

  if (checkMode) {
    console.log(`Checking ${files.length} SVG files...`);

    const invalid: string[] = [];

    for (const file of files) {
      const sourcePath = path.join(
        sourceDir,
        file,
      );

      const svg = await fs.readFile(
        sourcePath,
        "utf8",
      );

      if (!hasGeometryElements(svg)) {
        invalid.push(file);
      }
    }

    console.log("");
    console.log("Invalid / empty SVGs:");
    for (const file of invalid) {
      console.log(`- ${file}`);
    }

    const validCount =
      files.length - invalid.length;

    console.log("");
    console.log(`Valid: ${validCount}`);
    console.log(`Invalid: ${invalid.length}`);
    console.log(`Total: ${files.length}`);

    if (!fixMode) {
      if (invalid.length > 0) {
        process.exit(1);
      }

      console.log("Done.");
      return;
    }

    let repairedWithPixelization = 0;
    let repairedWithFallback = 0;
    let failed = 0;

    for (const file of invalid) {
      let originalSvg: string;

      try {
        originalSvg = await readOriginalFromGit(file);
      } catch (error) {
        console.error(
          `[fix] ${file}: failed to load original from git`,
        );
        failed += 1;
        continue;
      }

      const result = await pixelizeSvg(
        originalSvg,
        grid,
        block,
        rasterThreshold,
        blockThreshold,
        file,
      );

      let repairedSvg = result.svg;
      let usedFallback = false;

      if (!hasGeometryElements(repairedSvg)) {
        const fallbackSvg =
          removeRoundness(originalSvg);

        if (!hasGeometryElements(fallbackSvg)) {
          console.error(
            `[fix] ${file}: pixelization and fallback both produced no geometry`,
          );

          failed += 1;
          continue;
        }

        repairedSvg = fallbackSvg;
        usedFallback = true;
      }

      const targetPath = path.join(
        sourceDir,
        file,
      );

      await fs.writeFile(
        targetPath,
        repairedSvg,
        "utf8",
      );

      if (usedFallback) {
        repairedWithFallback += 1;
      } else {
        repairedWithPixelization += 1;
      }
    }

    console.log("");
    console.log(`Checked: ${files.length}`);
    console.log(
      `Invalid found: ${invalid.length}`,
    );
    console.log(
      `Repaired with pixelization: ${repairedWithPixelization}`,
    );
    console.log(
      `Repaired with fallback: ${repairedWithFallback}`,
    );
    console.log(`Failed: ${failed}`);

    if (invalid.length > repairedWithPixelization + repairedWithFallback + failed) {
      throw new Error(
        "Fix attempt did not account for all invalid SVGs.",
      );
    }

    if (failed > 0) {
      process.exit(1);
    }

    console.log("Done.");
    return;
  }

  const hasFilesFilter =
    requestedFiles !== undefined;
  const hasFileFilter =
    requestedFile !== undefined;

  const requestedFileList = hasFilesFilter
    ? uniqueByLowerCase(
        parseFilesList(requestedFiles),
      )
    : [];

  const requestedSingleList = hasFileFilter
    ? uniqueByLowerCase(
        parseFilesList(requestedFile),
      )
    : [];

  const selectedFromFilter = hasFilesFilter
    ? resolveRequestedFiles(
        requestedFileList,
        files,
      )
    : hasFileFilter
      ? resolveRequestedFiles(
          requestedSingleList,
          files,
        )
      : [];

  const expectedFromFilter = hasFilesFilter
    ? requestedFileList
    : requestedSingleList;

  const missingFiles = hasFilesFilter || hasFileFilter
    ? expectedFromFilter.filter(
        (requested) =>
          !selectedFromFilter.some(
            (selected) =>
              selected.toLowerCase() ===
              requested.toLowerCase(),
          ),
      )
    : [];

  if (
    (hasFilesFilter || hasFileFilter) &&
    missingFiles.length > 0
  ) {
    throw new Error(
      `SVG files not found: ${missingFiles.join(", ")}`,
    );
  }

  const filesToProcess = hasFilesFilter || hasFileFilter
    ? selectedFromFilter
    : limit
      ? files.slice(0, limit)
      : files;

  const isLimitMode = limit !== undefined && !(
    hasFilesFilter || hasFileFilter
  );

  if (hasFilesFilter) {
    console.log(
      `Selected files mode: ${filesToProcess.length} icons`,
    );
    console.log(
      `Files: ${filesToProcess.join(", ")}`,
    );
  } else if (hasFileFilter) {
    console.log(
      `Single file mode: ${filesToProcess[0]}`,
    );
  }

  console.log(`SVG files found: ${files.length}`);
  console.log(
    `SVG files to process: ${filesToProcess.length}`,
  );
  console.log(
    `Mode: ${pixelMode ? "pixel" : "square"}`,
  );
  console.log(`Grid: ${grid}`);
  console.log(`Block: ${block}`);
  console.log(`Raster threshold: ${rasterThreshold}`);
  console.log(`Block threshold: ${blockThreshold}`);
  console.log("");

  const { pixelized, fallback, skipped } =
    await convertIcons(
      filesToProcess,
      isLimitMode ? files.length : undefined,
    );

  console.log("");

  console.log(
    `Converted ${pixelized + fallback + skipped} Lucide icons.`,
  );
  console.log(`Pixelized: ${pixelized}`);
  console.log(`Fallback: ${fallback}`);
  console.log(`Skipped: ${skipped}`);

  console.log(
    `Output: ${
      inPlace ? "in-place" : outputDir
    }`,
  );

  console.log("");
  console.log("Generating preview...");

  await generatePreview(
    inPlace ? sourceDir : outputDir,
  );

  console.log("");
  console.log("Done.");
};

main().catch(
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
