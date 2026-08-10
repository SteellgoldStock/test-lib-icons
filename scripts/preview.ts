import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { root } from "../src/lib.js";

const defaultInputDir = path.join(root, "output");

const resolveInputDir = (inputPath?: string): string => {
  if (!inputPath) {
    return defaultInputDir;
  }

  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(root, inputPath);
};

export const generatePreview = async (
  inputPath?: string,
): Promise<void> => {
  const inputDir = resolveInputDir(inputPath);

  // Put preview.html next to the selected directory.
  const outputFile = path.join(
    path.dirname(inputDir),
    "preview.html",
  );

  await fs.mkdir(inputDir, {
    recursive: true,
  });

  const files = (await fs.readdir(inputDir))
    .filter((file) =>
      file.toLowerCase().endsWith(".svg"),
    )
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.warn(
      `No SVG files found in ${inputDir}`,
    );
  }

  const cards = await Promise.all(
    files.map(async (file) => {
      const svg = await fs.readFile(
        path.join(inputDir, file),
        "utf8",
      );

      const name = file.replace(/\.svg$/i, "");

      return `
        <figure>
          <div class="icon">
            ${svg}
          </div>

          <figcaption title="${file}">
            ${name}
          </figcaption>
        </figure>
      `.trim();
    }),
  );

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>Pixel Icon Preview</title>

  <style>
    * {
      box-sizing: border-box;
    }

    :root {
      color-scheme: dark;
    }

    body {
      margin: 0;

      font-family:
        Arial,
        sans-serif;

      background: #0a0a0a;
      color: #fff;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;

      display: flex;
      align-items: center;
      justify-content: space-between;

      padding: 20px 24px;

      background: rgba(10, 10, 10, 0.94);
      border-bottom: 1px solid #242424;

      backdrop-filter: blur(12px);
    }

    h1 {
      margin: 0;

      font-size: 18px;
      font-weight: 600;
    }

    .count {
      color: #777;
      font-size: 13px;
    }

    .grid {
      display: grid;

      grid-template-columns:
        repeat(
          auto-fill,
          minmax(150px, 1fr)
        );

      gap: 12px;

      padding: 24px;
    }

    figure {
      overflow: hidden;

      margin: 0;

      background: #111;
      border: 1px solid #242424;
      border-radius: 8px;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;

      width: 100%;
      height: 140px;

      color: #fff;
      background: #080808;
    }

    .icon svg {
      width: 64px;
      height: 64px;

      image-rendering: pixelated;
    }

    figcaption {
      overflow: hidden;

      padding: 10px 12px;

      color: #aaa;
      border-top: 1px solid #242424;

      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;

      font-size: 12px;

      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty {
      padding: 80px 24px;

      color: #666;
      text-align: center;
    }
  </style>
</head>

<body>
  <header>
    <h1>Pixel Icon Preview</h1>

    <span class="count">
      ${files.length} icon${files.length === 1 ? "" : "s"}
    </span>
  </header>

  ${
    files.length > 0
      ? `
        <main class="grid">
          ${cards.join("\n")}
        </main>
      `
      : `
        <div class="empty">
          No SVG files found in ${inputDir}
        </div>
      `
  }
</body>
</html>`;

  await fs.writeFile(
    outputFile,
    html,
    "utf8",
  );

  console.log(
    `Preview updated: ${outputFile}`,
  );

  console.log(
    `Source: ${inputDir}`,
  );
};

const currentFile = fileURLToPath(
  import.meta.url,
);

const executedFile = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;

if (
  executedFile &&
  path.resolve(currentFile) === executedFile
) {
  const inputPath = process.argv[2];

  generatePreview(inputPath).catch(
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}