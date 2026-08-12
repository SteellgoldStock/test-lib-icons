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

const supportedDensityValues = [
  16,
  24,
  32,
] as const;

type SupportedDensity = (typeof supportedDensityValues)[number];

type LowDensitySimplification = "none" | "moderate" | "strong";

type PixelDensityPreset = {
  mode: "pixel";
  block: number;
  rasterThreshold: number;
  blockThreshold: number;
  simplification: LowDensitySimplification;
  strokeWidth: number;
  lodMinComponentArea?: number;
};

type VectorDensityPreset = {
  mode: "vector-square";
  strokeWidth: number;
};

type DensityPreset = PixelDensityPreset | VectorDensityPreset;

const densityPresets: Record<
  SupportedDensity,
  DensityPreset
> = {
  16: {
    mode: "vector-square",
    strokeWidth: 2,
  },
  24: {
    mode: "pixel",
    block: 1,
    rasterThreshold: 0.20,
    blockThreshold: 0.3,
    simplification: "none",
    strokeWidth: 2.0,
    lodMinComponentArea: 0,
  },
  32: {
    mode: "pixel",
    block: 1,
    rasterThreshold: 0.22, // légèrement plus strict que maintenant
    blockThreshold: 0.3,
    simplification: "none",
    strokeWidth: 1.85,
    lodMinComponentArea: 0,
  },
};

const parseDensityList = (
  value: string,
): number[] => {
  const normalized = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => Number(item));

  if (normalized.length === 0) {
    throw new Error(
      "--densities must be a comma-separated list.",
    );
  }

  const values = normalized.map((density) => {
    if (!Number.isInteger(density)) {
      throw new Error(
        `Invalid density: ${String(density)}. Use comma-separated integers.`,
      );
    }

    if (
      !supportedDensityValues.includes(
        density as SupportedDensity,
      )
    ) {
      throw new Error(
        `Unsupported density: ${density}. Supported densities are: ${supportedDensityValues.join(", ")}.`,
      );
    }

    return density;
  });

  return Array.from(new Set(values)).sort(
    (a, b) => a - b,
  );
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
const gridOption = gridValue
  ? Number(gridValue)
  : undefined;

const densitiesOption = readOption("--densities");
const densities = densitiesOption
  ? parseDensityList(densitiesOption)
  : [];
const hasDensityMode = densities.length > 0;
const requestedDensities =
  densities.length > 0 ? densities : [24];

if (gridOption !== undefined) {
  if (
    !Number.isInteger(gridOption) ||
    gridOption < 8 ||
    gridOption > 128
  ) {
    console.error(
      "--grid must be an integer between 8 and 128.",
    );
    process.exit(1);
  }

  if (!pixelizationEnabled) {
    console.warn(
      'Ignoring "--grid" because "--pixel" is not enabled.',
    );
  }

  if (hasDensityMode) {
    console.warn(
      'Ignoring "--grid" because "--densities" was provided.',
    );
  }
}

const rasterThresholdValue = readOption(
  "--raster-threshold",
);

const rasterThresholdOption =
  rasterThresholdValue
    ? Number(rasterThresholdValue)
    : undefined;

if (
  rasterThresholdOption !== undefined &&
  (!Number.isFinite(rasterThresholdOption) ||
    rasterThresholdOption < 0 ||
    rasterThresholdOption > 1)
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

const blockThresholdOption =
  blockThresholdValue
    ? Number(blockThresholdValue)
    : undefined;

if (
  blockThresholdOption !== undefined &&
  (!Number.isFinite(blockThresholdOption) ||
    blockThresholdOption < 0 ||
    blockThresholdOption > 1)
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
const blockOption = blockValue
  ? Number(blockValue)
  : undefined;

if (
  blockOption !== undefined &&
  (!Number.isInteger(blockOption) ||
    blockOption < 1 ||
    blockOption > 8)
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
const userOutputDir = readOption("--output");
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

const explicitOutputDir = userOutputDir
  ? path.resolve(process.cwd(), userOutputDir)
  : undefined;

if (inPlace && userOutputDir) {
  console.warn(
    'Ignoring "--output" because "--in-place" is enabled.',
  );
}

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

const outputRoot = inPlace
  ? sourceDir
  : explicitOutputDir ??
    (userSourceDir ? targetDir : defaultOutputDir);

const resolvedSourceDir = path.resolve(sourceDir);
const resolvedOutputRoot = path.resolve(outputRoot);

if (!inPlace && resolvedOutputRoot === resolvedSourceDir) {
  throw new Error(
    "Output directory resolves to the source directory. Use --in-place to overwrite source SVG files.",
  );
}

if (inPlace && hasDensityMode && requestedDensities.length > 1) {
  throw new Error(
    'Cannot use "--in-place" with multiple densities. Please run without "--in-place".',
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

type DensitySettings = {
  mode: "vector-square";
  size: number;
  sourceStrokeWidth: number;
} | {
  mode: "pixel";
  grid: number;
  block: number;
  rasterThreshold: number;
  blockThreshold: number;
  simplification: LowDensitySimplification;
  sourceStrokeWidth: number;
  lodMinComponentArea: number;
};

const defaultDensity = 24;
const selectedDensityOrDefault = hasDensityMode
  ? null
  : (gridOption ?? defaultDensity);

const isSupportedDensity = (
  density: number,
): density is SupportedDensity =>
  supportedDensityValues.includes(
    density as SupportedDensity,
  );

const resolveDensitySettings =
  (density: number): DensitySettings => {
    if (!isSupportedDensity(density)) {
      return {
        mode: "pixel",
        grid: hasDensityMode
          ? density
          : (gridOption ?? density),
        block: blockOption ?? 1,
        rasterThreshold:
          rasterThresholdOption ?? 0.2,
        blockThreshold:
          blockThresholdOption ?? 0.3,
        simplification: "none",
        sourceStrokeWidth: 2,
        lodMinComponentArea: 0,
      };
    }

    const preset = densityPresets[density];

    if (preset.mode === "vector-square") {
      return {
        mode: "vector-square",
        size: density,
        sourceStrokeWidth: preset.strokeWidth,
      };
    }

    return {
      mode: "pixel",
      grid: hasDensityMode
        ? density
        : (gridOption ?? defaultDensity),
      block:
        blockOption ??
        preset.block,
      rasterThreshold:
        rasterThresholdOption ??
        preset.rasterThreshold,
      blockThreshold:
        blockThresholdOption ??
        preset.blockThreshold,
      simplification:
        preset.simplification,
      sourceStrokeWidth:
        preset.strokeWidth,
      lodMinComponentArea:
        preset.lodMinComponentArea ??
        0,
    };
  };

const resolveDensityOutputDir = (
  density: number,
): string =>
  hasDensityMode && !inPlace && density !== defaultDensity
    ? path.join(outputRoot, "densities", `${density}`)
    : outputRoot;

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
    if (
      hasDensityMode &&
      !inPlace &&
      resolvedTarget === path.resolve(outputRoot) &&
      requestedDensities.length > 1 &&
      entry.name === "densities" &&
      entry.isDirectory()
    ) {
      continue;
    }

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

const setSvgAttribute = (
  svgTag: string,
  attribute: string,
  value: string,
): string => {
  const pattern = new RegExp(
    `\\s${attribute}=(["'])[^"']*\\1`,
    "i",
  );

  if (pattern.test(svgTag)) {
    return svgTag.replace(
      pattern,
      ` ${attribute}="${value}"`,
    );
  }

  return svgTag.replace(
    ">",
    ` ${attribute}="${value}">`,
  );
};

const setRootSvgAttributes = (
  svg: string,
  width: number,
  height: number,
): string => {
  const match = svg.match(/<svg\b[^>]*>/i);
  if (!match) {
    return svg;
  }

  const matchIndex = match.index;
  if (matchIndex === undefined) {
    return svg;
  }

  let tag = match[0];
  tag = setSvgAttribute(tag, "width", String(width));
  tag = setSvgAttribute(tag, "height", String(height));

  const hasViewBox = /\sviewbox=/i.test(tag);
  if (!hasViewBox) {
    tag = setSvgAttribute(
      tag,
      "viewBox",
      "0 0 24 24",
    );
  }

  return `${svg.slice(0, matchIndex)}${tag}${svg.slice(matchIndex + match[0].length)}`;
};

const generateSquaredVectorSvg = (
  svg: string,
  size: number,
  strokeWidth: number,
): string => {
  return setRootSvgAttributes(
    normalizeStrokeWidth(
      removeRoundness(svg),
      strokeWidth,
    ),
    size,
    size,
  );
};

const normalizeStrokeWidth = (
  svg: string,
  targetStrokeWidth: number,
  sourceStrokeWidth = 2,
): string => {
  if (sourceStrokeWidth <= 0) {
    return svg;
  }

  const scale = targetStrokeWidth / sourceStrokeWidth;
  if (scale === 1) {
    return svg;
  }

  const normalizeToken = (
    raw: string,
  ): string => {
    const match = raw.match(
      /^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)(\s*[a-zA-Z%]*)$/,
    );

    if (!match) {
      return raw;
    }

    const value = Number(match[1]);
    if (!Number.isFinite(value)) {
      return raw;
    }

    const unit = match[2] ?? "";
    const scaled = value * scale;

    return `${parseFloat(scaled.toFixed(3))}${unit}`;
  };

  let output = svg;

  output = output.replace(
    /\bstroke-width\s*=\s*(["'])([^"']+)\1/gi,
    (_match, quote, value) =>
      `stroke-width=${quote}${normalizeToken(
        String(value),
      )}${quote}`,
  );

  output = output.replace(
    /(stroke-width\s*:\s*)([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?\s*[a-zA-Z%]*)(\s*)/g,
    (_match, prefix, value, suffix) =>
      `${prefix}${normalizeToken(value)}${suffix}`,
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

type PixelLayer = "outline";

const replaceAttributeGlobally = (
  svg: string,
  attribute: string,
  value: string,
): string => {
  const pattern = new RegExp(
    `\\b${attribute}\\s*=\\s*(["'])[^"']*\\1`,
    "gi",
  );

  return svg.replace(
    pattern,
    `${attribute}="${value}"`,
  );
};

const forceRootAttribute = (
  svg: string,
  attribute: string,
  value: string,
): string => {
  const match = svg.match(/<svg\b[^>]*>/i);
  if (!match) {
    return svg;
  }

  const matchIndex = match.index;
  if (matchIndex === undefined) {
    return svg;
  }

  const updatedTag = setSvgAttribute(
    match[0],
    attribute,
    value,
  );

  return `${svg.slice(0, matchIndex)}${updatedTag}${svg.slice(
    matchIndex + match[0].length,
  )}`;
};

const getSvgRoot = (
  svg: string,
): string | null => {
  const match = svg.match(/<svg\b[^>]*>/i);
  return match ? match[0] : null;
};

const parseNumericAttribute = (
  value: string | null,
): number | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const valueAsNumber = Number(normalized);

  return Number.isFinite(valueAsNumber)
    ? valueAsNumber
    : null;
};

const parseViewBox = (
  svg: string,
): { x: number; y: number; width: number; height: number } | null => {
  const root = getSvgRoot(svg);
  if (!root) {
    return null;
  }

  const viewBoxMatch = root.match(
    /\bviewBox\s*=\s*["']([^"']+)["']/i,
  );
  if (viewBoxMatch) {
    const values = viewBoxMatch[1]
      .split(/[\s,]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));

    if (values.length === 4) {
      return {
        x: values[0],
        y: values[1],
        width: values[2] - values[0],
        height: values[3] - values[1],
      };
    }
  }

  const width = parseNumericAttribute(
    root.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1] ?? "",
  );

  const height = parseNumericAttribute(
    root.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1] ?? "",
  );

  if (
    width !== null &&
    height !== null &&
    width > 0 &&
    height > 0
  ) {
    return { x: 0, y: 0, width, height };
  }

  return null;
};

const getAttribute = (
  attributes: string,
  attribute: string,
): string | undefined => {
  const match = attributes.match(
    new RegExp(
      `\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`,
      "i",
    ),
  );

  return match?.[2];
};

const isClosedPath = (
  d: string,
): boolean => {
  const tokens = d.match(
    /[a-zA-Z]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g,
  );
  if (!tokens || tokens.length === 0) {
    return false;
  }

  let index = 0;
  let x = 0;
  let y = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  let hasSubpath = false;

  const nextNumber = (): number | null => {
    const token = tokens[index];
    if (token === undefined) {
      return null;
    }

    if (Number.isNaN(Number(token))) {
      return null;
    }

    index += 1;
    return Number(token);
  };

  const isNumberToken = (token?: string): boolean =>
    token !== undefined && Number.isFinite(Number(token));

  const endpointEqualsStart = (): boolean =>
    hasSubpath &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x === subpathStartX &&
    y === subpathStartY;

  const consumeCoordinate = (
    current: number,
    value: number,
    isRelative: boolean,
  ): number => (isRelative ? current + value : value);

  while (index < tokens.length) {
    const command = tokens[index++];
    const commandLower = command.toLowerCase();

    if (Number.isFinite(Number(command))) {
      return false;
    }

    const isRelative = command === commandLower;

    if (commandLower === "m") {
      const moveX = nextNumber();
      const moveY = nextNumber();

      if (moveX === null || moveY === null) {
        return false;
      }

      x = consumeCoordinate(x, moveX, isRelative);
      y = consumeCoordinate(y, moveY, isRelative);
      subpathStartX = x;
      subpathStartY = y;
      hasSubpath = true;

      while (isNumberToken(tokens[index])) {
        const lineX = nextNumber();
        const lineY = nextNumber();
        if (lineX === null || lineY === null) {
          break;
        }

        x = consumeCoordinate(x, lineX, isRelative);
        y = consumeCoordinate(y, lineY, isRelative);

        if (endpointEqualsStart()) {
          return true;
        }
      }

      continue;
    }

    if (commandLower === "z") {
      x = subpathStartX;
      y = subpathStartY;
      return true;
    }

    if (commandLower === "h") {
      while (isNumberToken(tokens[index])) {
        const nextX = nextNumber();
        if (nextX === null) {
          break;
        }

        x = isRelative ? x + nextX : nextX;
      }

      if (endpointEqualsStart()) {
        return true;
      }

      continue;
    }

    if (commandLower === "v") {
      while (isNumberToken(tokens[index])) {
        const nextY = nextNumber();
        if (nextY === null) {
          break;
        }

        y = isRelative ? y + nextY : nextY;
      }

      if (endpointEqualsStart()) {
        return true;
      }

      continue;
    }

    if (commandLower === "l") {
      while (isNumberToken(tokens[index])) {
        const px = nextNumber();
        const py = nextNumber();
        if (px === null || py === null) {
          break;
        }

        x = consumeCoordinate(x, px, isRelative);
        y = consumeCoordinate(y, py, isRelative);

        if (endpointEqualsStart()) {
          return true;
        }
      }

      continue;
    }

    if (commandLower === "q" || commandLower === "t") {
      while (isNumberToken(tokens[index])) {
        nextNumber();
        nextNumber();
        const px = nextNumber();
        const py = nextNumber();

        if (px === null || py === null) {
          break;
        }

        x = consumeCoordinate(x, px, isRelative);
        y = consumeCoordinate(y, py, isRelative);

        if (endpointEqualsStart()) {
          return true;
        }
      }

      continue;
    }

    if (commandLower === "c" || commandLower === "s") {
      while (isNumberToken(tokens[index])) {
        const pointCount = commandLower === "s" ? 4 : 6;
        const points: number[] = [];

        for (let i = 0; i < pointCount; i += 1) {
          const coordinate = nextNumber();
          if (coordinate === null) {
            return false;
          }

          points.push(coordinate);
        }

        const px = points[pointCount - 2];
        const py = points[pointCount - 1];
        if (px === null || py === null) {
          return false;
        }

        x = consumeCoordinate(x, px, isRelative);
        y = consumeCoordinate(y, py, isRelative);

        if (endpointEqualsStart()) {
          return true;
        }
      }

      continue;
    }

    if (commandLower === "a") {
      while (isNumberToken(tokens[index])) {
        for (let i = 0; i < 5; i += 1) {
          if (nextNumber() === null) {
            return false;
          }
        }

        const px = nextNumber();
        const py = nextNumber();

        if (px === null || py === null) {
          return false;
        }

        x = consumeCoordinate(x, px, isRelative);
        y = consumeCoordinate(y, py, isRelative);

        if (endpointEqualsStart()) {
          return true;
        }
      }

      continue;
    }

    return false;
  }

  return endpointEqualsStart();
};

const isClosedPolyline = (
  points: string,
): boolean => {
  const components = points
    .trim()
    .split(/[,\s]+/)
    .map((value) => Number(value));

  const numeric = components.filter((value) =>
    Number.isFinite(value),
  );

  if (numeric.length < 4 || numeric.length % 2 !== 0) {
    return false;
  }

  const firstX = numeric[0];
  const firstY = numeric[1];
  const lastX = numeric[numeric.length - 2];
  const lastY = numeric[numeric.length - 1];

  return (
    firstX === lastX &&
    firstY === lastY
  );
};

const removeFillAndStrokeAttributes = (
  attributes: string,
): string => {
  return attributes
    .replace(
      /\s+stroke(?:-[a-z0-9-]+)?\s*=\s*(['"])[\s\S]*?\1/gi,
      "",
    )
    .replace(
      /\s+fill\s*=\s*(['"])[\s\S]*?\1/gi,
      "",
    )
    .replace(
      /\s+style\s*=\s*(['"])[\s\S]*?\1/gi,
      "",
    )
    .replace(
      /\s+shape-rendering\s*=\s*(['"])[\s\S]*?\1/gi,
      "",
    )
    .replace(
      /\s+vector-effect\s*=\s*(['"])[\s\S]*?\1/gi,
      "",
    )
    .trim();
};

const shouldUseFillGeometry = (
  tagName: string,
  attributes: string,
): boolean => {
  const normalizedTag = tagName.toLowerCase();
  const d = getAttribute(attributes, "d");
  const points = getAttribute(attributes, "points");

  if (normalizedTag === "path") {
    return d !== undefined && isClosedPath(d);
  }

  if (
    normalizedTag === "circle" ||
    normalizedTag === "ellipse" ||
    normalizedTag === "rect" ||
    normalizedTag === "polygon"
  ) {
    return true;
  }

  if (normalizedTag === "polyline") {
    return points !== undefined && isClosedPolyline(points);
  }

  return false;
};

const extractFillLayerGeometry = (
  svg: string,
  targetGrid: number,
): string => {
  const bodyMatch = svg.match(
    /<svg\b[^>]*>([\s\S]*?)<\/svg>/i,
  );
  const body = bodyMatch?.[1] ?? "";

  const vectorNodes = [...body.matchAll(
    /<\s*(path|circle|ellipse|rect|polygon|polyline)\b([^>]*?)\/?>/gi,
  )];

  const fillNodes = vectorNodes
    .filter((match) =>
      shouldUseFillGeometry(
        match[1],
        match[2] ?? "",
      )
    )
    .map((match) => {
      const tagName = match[1];
      const attrs = removeFillAndStrokeAttributes(
        match[2] ?? "",
      );

      const cleanAttrs = attrs.length > 0
        ? ` ${attrs}`
        : "";

      return `  <${tagName}${cleanAttrs} />`;
    });

  if (fillNodes.length === 0) {
    return "";
  }

  const viewBox = parseViewBox(svg);
  if (!viewBox) {
    return fillNodes.join("\n");
  }

  const scaleX = targetGrid / viewBox.width;
  const scaleY = targetGrid / viewBox.height;
  const needsScale =
    Math.abs(scaleX - 1) > 0.00001 ||
    Math.abs(scaleY - 1) > 0.00001 ||
    viewBox.x !== 0 ||
    viewBox.y !== 0;

  if (!needsScale) {
    return fillNodes.join("\n");
  }

  const transform = [
    viewBox.x !== 0 ? `translate(${-viewBox.x} ${-viewBox.y})` : "",
    `scale(${scaleX} ${scaleY})`,
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  return [
    `  <g transform="${transform}">`,
    ...fillNodes.map((node) => `    ${node}`),
    "  </g>",
  ].join("\n");
};

const preparePixelLayerSource = (
  svg: string,
  sourceStrokeWidth: number,
  layer: PixelLayer,
): string => {
  let output = normalizeStrokeWidth(
    removeRoundness(svg),
    sourceStrokeWidth,
  ).replaceAll("currentColor", "#ffffff");

  if (layer === "outline") {
    output = replaceAttributeGlobally(
      output,
      "fill",
      "none",
    );
    output = replaceAttributeGlobally(
      output,
      "stroke",
      "#ffffff",
    );

    output = forceRootAttribute(
      output,
      "fill",
      "none",
    );
    output = forceRootAttribute(
      output,
      "stroke",
      "#ffffff",
    );
  } else {
    throw new Error(
      `Unsupported rasterization layer: ${layer}`,
    );
  }

  return output;
};

const rasterizeToCoverageMap = async (
  svg: string,
  targetGrid: number,
): Promise<CoverageMap> => {
  const {
    Resvg,
  } = await import("@resvg/resvg-js");

  const {
    PNG,
  } = await import("pngjs");

  const supersample = 4;
  const renderSize = targetGrid * supersample;

  const renderer = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: renderSize,
    },
  });

  const pngBuffer = renderer.render().asPng();
  const png = PNG.sync.read(pngBuffer);

  const coverageMap: CoverageMap = Array.from(
    { length: targetGrid },
    () => Array<number>(targetGrid).fill(0),
  );

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
          const px = gridX * supersample + sx;
          const py = gridY * supersample + sy;

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

      coverageMap[gridY][gridX] =
        samples > 0 ? alpha / samples : 0;
    }
  }

  return coverageMap;
};

const coverageToPixelRectangles = (
  coverage: CoverageMap,
  rasterThreshold: number,
  blockSize: number,
  blockThreshold: number,
  simplification: LowDensitySimplification,
  lodMinComponentArea: number,
): PixelRect[] => {
  const height = coverage.length;
  const width = coverage[0]?.length ?? 0;

  if (
    height === 0 ||
    width === 0
  ) {
    return [];
  }

  const pixels: PixelMap = Array.from(
    { length: height },
    () => Array<boolean>(width).fill(false),
  );

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y][x] = coverage[y][x] >= rasterThreshold;
    }
  }

  if (height === 18 && lodMinComponentArea > 0) {
    removeTinyCoverageComponents(
      coverage,
      lodMinComponentArea,
      rasterThreshold,
    );
  }

  const simplifiedPixels = simplifyLowDensityPixelMap(
    pixels,
    coverage,
    simplification,
  );

  const cleanedPixels =
    cleanPixelMap(simplifiedPixels);

  const snappedPixels =
    snapToBlocks(
      cleanedPixels,
      blockSize,
      blockThreshold,
    );

  return vectorizePixelMap(snappedPixels);
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

type NeighborStats = {
  orthogonal: number;
  diagonal: number;
  total: number;
};

const countNeighborsTyped = (
  pixels: PixelMap,
  x: number,
  y: number,
): NeighborStats => {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  let orthogonal = 0;
  let diagonal = 0;
  let total = 0;

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
        total += 1;

        if (dx === 0 || dy === 0) {
          orthogonal += 1;
        } else {
          diagonal += 1;
        }
      }
    }
  }

  return {
    orthogonal,
    diagonal,
    total,
  };
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

const removeTinyCoverageComponents = (
  coverage: CoverageMap,
  minComponentArea: number,
  rasterThreshold: number,
): void => {
  if (
    minComponentArea <= 0 ||
    coverage.length === 0
  ) {
    return;
  }

  const height = coverage.length;
  const width = coverage[0]?.length ?? 0;

  if (width === 0) {
    return;
  }

  const visited = Array.from(
    { length: height },
    () => Array<boolean>(width).fill(false),
  );

  const seedThreshold = Math.max(
    0.05,
    rasterThreshold * 0.55,
  );

  const stack: Array<[number, number]> = [];
  const component: Array<[number, number]> = [];

  const neigh8 = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ] as const;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        visited[y][x] ||
        coverage[y][x] < seedThreshold
      ) {
        continue;
      }

      stack.length = 0;
      component.length = 0;

      stack.push([x, y]);
      visited[y][x] = true;

      while (stack.length > 0) {
        const [cellX, cellY] = stack.pop() as [
          number,
          number,
        ];

        component.push([cellX, cellY]);

        for (const [dx, dy] of neigh8) {
          const nx = cellX + dx;
          const ny = cellY + dy;

          if (
            nx < 0 ||
            nx >= width ||
            ny < 0 ||
            ny >= height ||
            visited[ny][nx] ||
            coverage[ny][nx] < seedThreshold
          ) {
            continue;
          }

          visited[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }

      if (component.length <= minComponentArea) {
        for (const [cx, cy] of component) {
          coverage[cy][cx] = 0;
        }
      }
    }
  }
};

type CoverageMap = number[][];

type LowDensitySimplificationProfile = {
  noiseThreshold: number;
  bridgeThreshold: number;
  cornerThreshold: number;
};

const lowDensityProfiles: Record<
  Exclude<LowDensitySimplification, "none">,
  LowDensitySimplificationProfile
> = {
  moderate: {
    noiseThreshold: 0.50,
    bridgeThreshold: 0.48,
    cornerThreshold: 0.55,
  },
  strong: {
    noiseThreshold: 0.56,
    bridgeThreshold: 0.50,
    cornerThreshold: 0.58,
  },
};

const removeLowConfidenceNoise = (
  pixels: PixelMap,
  coverage: CoverageMap,
  threshold: number,
): PixelMap => {
  const output = pixels.map((row) => [...row]);
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pixels[y][x] || coverage[y][x] >= threshold) {
        continue;
      }

      const neighbors = countNeighborsTyped(
        pixels,
        x,
        y,
      );

      if (neighbors.total <= 1) {
        output[y][x] = false;
        continue;
      }

      if (
        neighbors.total === 2 &&
        neighbors.orthogonal <= 1
      ) {
        output[y][x] = false;
      }
    }
  }

  return output;
};

const removeDiagonalBridgeNoise = (
  pixels: PixelMap,
  coverage: CoverageMap,
  threshold: number,
): PixelMap => {
  const output = pixels.map((row) => [...row]);
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        !pixels[y][x] ||
        coverage[y][x] >= threshold
      ) {
        continue;
      }

      const neighbors = countNeighborsTyped(
        pixels,
        x,
        y,
      );

      if (
        neighbors.orthogonal !== 0 ||
        neighbors.diagonal !== 2
      ) {
        continue;
      }

      const diagUpLeft =
        x > 0 &&
        y > 0 &&
        pixels[y - 1][x - 1];

      const diagUpRight =
        x + 1 < width &&
        y > 0 &&
        pixels[y - 1][x + 1];

      const diagDownLeft =
        x > 0 &&
        y + 1 < height &&
        pixels[y + 1][x - 1];

      const diagDownRight =
        x + 1 < width &&
        y + 1 < height &&
        pixels[y + 1][x + 1];

      if (
        (diagUpLeft && diagDownRight) ||
        (diagUpRight && diagDownLeft)
      ) {
        output[y][x] = false;
      }
    }
  }

  return output;
};

const removeCornerFragments = (
  pixels: PixelMap,
  coverage: CoverageMap,
  threshold: number,
): PixelMap => {
  const output = pixels.map((row) => [...row]);
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pixels[y][x] || coverage[y][x] >= threshold) {
        continue;
      }

      const up =
        y > 0 && pixels[y - 1][x];
      const down =
        y + 1 < height && pixels[y + 1][x];
      const left =
        x > 0 && pixels[y][x - 1];
      const right =
        x + 1 < width && pixels[y][x + 1];

      const diagUpLeft =
        y > 0 &&
        x > 0 &&
        pixels[y - 1][x - 1];
      const diagUpRight =
        y > 0 &&
        x + 1 < width &&
        pixels[y - 1][x + 1];
      const diagDownLeft =
        y + 1 < height &&
        x > 0 &&
        pixels[y + 1][x - 1];
      const diagDownRight =
        y + 1 < height &&
        x + 1 < width &&
        pixels[y + 1][x + 1];

      if (
        (left && up && diagUpLeft && !right && !down) ||
        (up && right && diagUpRight && !left && !down) ||
        (right && down && diagDownRight && !left && !up) ||
        (down && left && diagDownLeft && !right && !up)
      ) {
        output[y][x] = false;
      }
    }
  }

  return output;
};

const simplifyLowDensityPixelMap = (
  pixels: PixelMap,
  coverage: CoverageMap,
  simplification: LowDensitySimplification,
): PixelMap => {
  if (simplification === "none") {
    return pixels;
  }

  const profile = lowDensityProfiles[simplification];
  const withNoiseRemoved = removeLowConfidenceNoise(
    pixels,
    coverage,
    profile.noiseThreshold,
  );

  const withBridgeRemoved =
    removeDiagonalBridgeNoise(
      withNoiseRemoved,
      coverage,
      profile.bridgeThreshold,
    );

  if (simplification === "strong") {
    return removeCornerFragments(
      withBridgeRemoved,
      coverage,
      profile.cornerThreshold,
    );
  }

  return withBridgeRemoved;
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
  simplification: LowDensitySimplification,
  sourceStrokeWidth: number,
  lodMinComponentArea: number,
  file?: string,
): Promise<PixelizeResult> => {
  const [outlineCoverage] = await Promise.all([
    rasterizeToCoverageMap(
      preparePixelLayerSource(
        svg,
        sourceStrokeWidth,
        "outline",
      ),
      targetGrid,
    ),
  ]);

  const outlineRectangles = coverageToPixelRectangles(
    outlineCoverage,
    rasterThreshold,
    blockSize,
    blockThreshold,
    simplification,
    lodMinComponentArea,
  );

  const hasOutline = outlineRectangles.length > 0;
  const fillLayerGeometry =
    extractFillLayerGeometry(svg, targetGrid);
  const hasFill = fillLayerGeometry.length > 0;

  if (!hasOutline && !hasFill) {
    console.warn(
      `[fallback] ${file ?? "icon"} produced no pixel geometry; preserving squared source SVG.`,
    );

    return {
      svg: removeRoundness(svg),
      fallbackUsed: true,
    };
  }

  const fillLayerBody = hasFill
    ? `<g>
${fillLayerGeometry}
</g>`
    : "";

  const outlineLayerBody = hasOutline
    ? `<g fill="currentColor">
${outlineRectangles
  .map(
    (rect) =>
      `  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" />`,
  )
  .join("\n")}
</g>`
    : "";

  const body = [fillLayerBody, outlineLayerBody]
    .filter((item) => item.length > 0)
    .join("\n");

  return {
    svg: `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${targetGrid}"
  height="${targetGrid}"
  viewBox="0 0 ${targetGrid} ${targetGrid}"
  fill="none"
  shape-rendering="crispEdges"
>
${body}
</svg>
`,
    fallbackUsed: false,
  };
};

const hasGeometryElements = (
  svg: string,
): boolean => {
  return /<\s*(?:path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*>/i.test(
    svg,
  );
};

const generateDensitySvg = async (
  svg: string,
  settings: DensitySettings,
  file?: string,
): Promise<PixelizeResult> => {
  if (settings.mode === "vector-square") {
    const vectorSquareSvg =
      generateSquaredVectorSvg(
        svg,
        settings.size,
        settings.sourceStrokeWidth,
      );

    if (!hasGeometryElements(vectorSquareSvg)) {
      console.warn(
        `[fallback] ${file ?? "icon"} produced no vector geometry; preserving squared source SVG.`,
      );
    }

    return {
      svg: vectorSquareSvg,
      fallbackUsed: !hasGeometryElements(vectorSquareSvg),
    };
  }

  return pixelizeSvg(
    svg,
    settings.grid,
    settings.block,
    settings.rasterThreshold,
    settings.blockThreshold,
    settings.simplification,
    settings.sourceStrokeWidth,
    settings.lodMinComponentArea,
    file,
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
    outputPath: string,
    settings: DensitySettings,
    totalSourceCount?: number,
  ): Promise<ConvertSummary> => {
  await cleanTargetDirectory(outputPath);

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
      outputPath,
      file,
    );

    const svg = await fs.readFile(
      sourcePath,
      "utf8",
    );

    const result = pixelMode
      ? await generateDensitySvg(svg, settings, file)
      : {
          svg: removeRoundness(svg),
          fallbackUsed: false,
        };

    const finalSvg = result.svg;
    const hasGeometry = hasGeometryElements(finalSvg);
    const isVectorSquareMode =
      settings.mode === "vector-square";

    if (!hasGeometry && isVectorSquareMode) {
      const fallbackSvg =
        generateSquaredVectorSvg(
          svg,
          settings.size,
          settings.sourceStrokeWidth,
        );
      const hasFallbackGeometry =
        hasGeometryElements(fallbackSvg);

      if (!hasFallbackGeometry) {
        console.error(
          `[skip] ${file} produced an invalid SVG with no supported geometry; preserving source.`,
        );

        skippedCount += 1;
      } else {
        await fs.writeFile(
          targetPath,
          fallbackSvg,
          "utf8",
        );

        converted += 1;
        fallbackCount += 1;
      }
    } else if (!hasGeometry) {
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

    if (hasDensityMode) {
      console.log(
        `Output root: ${inPlace ? "in-place" : outputRoot}`,
      );
      console.log(
        `Selected densities: ${requestedDensities.join(", ")}`,
      );
    } else {
      console.log(
        `Output: ${inPlace ? "in-place" : outputRoot}`,
      );
    }

    await ensureDependencies();

    const files = await listSourceSvgs();

    if (files.length === 0) {
      throw new Error(
        `No SVG files found in ${sourceDir}`,
      );
    }

    if (checkMode) {
      console.log(
        `Checking ${files.length} SVG files...`,
      );

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

      const checkSettings = resolveDensitySettings(
        hasDensityMode
          ? requestedDensities[0]
          : selectedDensityOrDefault,
      );

      for (const file of invalid) {
        let originalSvg: string;

        try {
          originalSvg = await readOriginalFromGit(file);
        } catch {
          console.error(
            `[fix] ${file}: failed to load original from git`,
          );
          failed += 1;
          continue;
        }

        const result = await generateDensitySvg(
          originalSvg,
          checkSettings,
          file,
        );

        let repairedSvg = result.svg;
        let usedFallback = false;

        if (!hasGeometryElements(repairedSvg)) {
          const fallbackSvg =
            removeRoundness(originalSvg);

          if (
            !hasGeometryElements(fallbackSvg)
          ) {
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

      if (
        invalid.length >
        repairedWithPixelization +
          repairedWithFallback +
          failed
      ) {
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

    const missingFiles = hasFilesFilter ||
      hasFileFilter
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

    const filesToProcess =
      hasFilesFilter || hasFileFilter
        ? selectedFromFilter
        : limit
          ? files.slice(0, limit)
          : files;

    const isLimitMode =
      limit !== undefined && !(
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
      hasDensityMode
        ? `SVG files to process per density: ${filesToProcess.length}`
        : `SVG files to process: ${filesToProcess.length}`,
    );
    console.log(
      `Mode: ${pixelMode ? "pixel" : "square"}`,
    );

    if (hasDensityMode) {
      console.log(`Density presets:`);
      for (const density of requestedDensities) {
        const settings = resolveDensitySettings(density);
        if (settings.mode === "vector-square") {
          console.log(
            `  ${density}x${density}: mode ${settings.mode}, size ${settings.size}, strokeWidth ${settings.sourceStrokeWidth}`,
          );
        } else {
          console.log(
            `  ${density}x${density}: mode ${settings.mode}, block ${settings.block}, raster ${settings.rasterThreshold}, blockThreshold ${settings.blockThreshold}, simplification ${settings.simplification}, strokeWidth ${settings.sourceStrokeWidth}, lodMinComponentArea ${settings.lodMinComponentArea}`,
          );
        }
      }
    } else {
      const settings = resolveDensitySettings(
        selectedDensityOrDefault,
      );
      if (settings.mode === "vector-square") {
        console.log(`Mode: ${settings.mode}`);
        console.log(`Size: ${settings.size}`);
        console.log(
          `Stroke width: ${settings.sourceStrokeWidth}`,
        );
      } else {
        console.log(`Grid: ${settings.grid}`);
        console.log(`Block: ${settings.block}`);
        console.log(
          `Raster threshold: ${settings.rasterThreshold}`,
        );
        console.log(
          `Stroke width: ${settings.sourceStrokeWidth}`,
        );
        console.log(
          `LOD min component area: ${settings.lodMinComponentArea}`,
        );
        console.log(
          `Block threshold: ${settings.blockThreshold}`,
        );
      }
    }

    console.log("");

    if (!hasDensityMode) {
      const settings = resolveDensitySettings(
        selectedDensityOrDefault,
      );
      const summary = await convertIcons(
        filesToProcess,
        resolveDensityOutputDir(selectedDensityOrDefault),
        settings,
        isLimitMode ? files.length : undefined,
      );

      console.log("");
      console.log(
        `Converted ${summary.pixelized + summary.fallback + summary.skipped} Lucide icons.`,
      );
      console.log(
        `Pixelized: ${summary.pixelized}`,
      );
      console.log(`Fallback: ${summary.fallback}`);
      console.log(`Skipped: ${summary.skipped}`);
    } else {
      const nonCanonicalDensities =
        requestedDensities;

      console.log(
        `Generating ${requestedDensities.length} requested densities:`,
      );

      const allSummaries: Array<
        {
          density: number;
          summary: ConvertSummary;
        }
      > = [];

      for (const density of nonCanonicalDensities) {
        const outputDir = resolveDensityOutputDir(
          density,
        );
        const settings = resolveDensitySettings(
          density,
        );

        console.log("");
        console.log(`Generating ${density}x${density}...`);
        const summary = await convertIcons(
          filesToProcess,
          outputDir,
          settings,
          isLimitMode ? files.length : undefined,
        );

        allSummaries.push({
          density,
          summary,
        });
      }

      console.log("");
      console.log("Final summary:");

      for (const {
        density,
        summary,
      } of allSummaries) {
        console.log(`\n${density}x${density}:`);
        console.log(`Pixelized: ${summary.pixelized}`);
        console.log(`Fallback: ${summary.fallback}`);
        console.log(`Skipped: ${summary.skipped}`);
      }
    }

    console.log("");
    console.log(
      `Output: ${inPlace ? "in-place" : outputRoot}`,
    );

    console.log("");
    console.log("Generating preview...");

    if (hasDensityMode) {
      for (const density of requestedDensities) {
        const densitySettings = resolveDensitySettings(
          density,
        );

        const densityDir = resolveDensityOutputDir(
          density,
        );
        const densitySourceDir = densityDir;

        const densityModeLabel =
          density === defaultDensity
            ? "default pixel"
            : density === 32
              ? "detailed pixel"
              : densitySettings.mode;

        await generatePreview(
          densitySourceDir,
          `preview-${density}.html`,
          `${density}x${density} · ${densityModeLabel}`,
          outputRoot,
        );
      }
    } else {
      await generatePreview(
        inPlace ? sourceDir : outputRoot,
        "preview.html",
        undefined,
        outputRoot,
      );
    }

    console.log("");
    console.log("Done.");
  };

main().catch(
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
