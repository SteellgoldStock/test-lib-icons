import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { root } from "../src/lib.js";
import { generatePreview } from "./preview.js";

const execFileAsync = promisify(execFile);

const packageName = "lucide-static";
const sourceDir = path.join(
  root,
  "node_modules",
  packageName,
  "icons",
);

const targetDir = path.join(
  root,
  "icons",
  "lucide",
);

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

const installLucide = async (): Promise<void> => {
  if (await exists(sourceDir)) {
    console.log("Lucide Static already installed.");
    return;
  }

  console.log("Lucide Static not found.");
  console.log("Installing lucide-static...");

  if (process.platform === "win32") {
    await execFileAsync(
      "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        `pnpm add -D ${packageName}`,
      ],
      {
        cwd: root,
      },
    );
  } else {
    await execFileAsync(
      "pnpm",
      [
        "add",
        "-D",
        packageName,
      ],
      {
        cwd: root,
      },
    );
  }

  if (!(await exists(sourceDir))) {
    throw new Error(
      `Lucide icons directory not found after installation: ${sourceDir}`,
    );
  }

  console.log("Lucide Static installed.");
};

/**
 * Removes decorative roundness while preserving semantic curves.
 *
 * Converts:
 * - stroke-linecap="round" -> square
 * - stroke-linejoin="round" -> miter
 * - rx / ry on rectangles -> removed
 *
 * Intentionally preserves circles, ellipses and path arcs because
 * many Lucide icons need them semantically (search, clock, globe, etc.).
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

const convertIcons = async (): Promise<number> => {
  await fs.rm(targetDir, {
    recursive: true,
    force: true,
  });

  await fs.mkdir(targetDir, {
    recursive: true,
  });

  const files = (await fs.readdir(sourceDir))
    .filter((file) =>
      file.toLowerCase().endsWith(".svg"),
    )
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(
      `No SVG files found in ${sourceDir}`,
    );
  }

  let converted = 0;

  for (const file of files) {
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

    const squaredSvg = removeRoundness(svg);

    await fs.writeFile(
      targetPath,
      squaredSvg,
      "utf8",
    );

    converted += 1;

    if (
      converted % 100 === 0 ||
      converted === files.length
    ) {
      console.log(
        `Converted ${converted}/${files.length}`,
      );
    }
  }

  return converted;
};

const main = async (): Promise<void> => {
  console.log("Building squared Lucide icon set...");
  console.log("");

  await installLucide();

  const converted = await convertIcons();

  console.log("");
  console.log(
    `Converted ${converted} Lucide icons.`,
  );
  console.log(`Output: ${targetDir}`);

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
