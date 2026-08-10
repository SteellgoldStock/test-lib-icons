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

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const generatePreview = async (
  inputPath?: string,
): Promise<void> => {
  const inputDir = resolveInputDir(inputPath);

  const outputFile = path.join(
    path.dirname(inputDir),
    "..",
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

  const cards = await Promise.all(
    files.map(async (file) => {
      const svg = await fs.readFile(
        path.join(inputDir, file),
        "utf8",
      );

      const name = file.replace(/\.svg$/i, "");
      const safeName = escapeHtml(name);
      const safeFile = escapeHtml(file);

      return `
        <figure data-icon-name="${safeName.toLowerCase()}">
          <div class="icon">${svg}</div>
          <figcaption title="${safeFile}">${safeName}</figcaption>
        </figure>
      `.trim();
    }),
  );

  const sourceName = escapeHtml(path.basename(inputDir));

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
      --icon-size: 32px;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0a0a0a;
      color: #fff;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 24px;
      background: rgba(10, 10, 10, 0.94);
      border-bottom: 1px solid #242424;
      backdrop-filter: blur(12px);
    }

    .title {
      min-width: max-content;
    }

    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .source {
      margin-top: 3px;
      color: #666;
      font-size: 11px;
    }

    .controls {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 10px;
      max-width: 680px;
      margin-left: auto;
    }

    input,
    select {
      height: 36px;
      color: #fff;
      background: #111;
      border: 1px solid #2b2b2b;
      border-radius: 6px;
      outline: none;
    }

    input:focus,
    select:focus {
      border-color: #555;
    }

    input {
      flex: 1;
      min-width: 140px;
      padding: 0 12px;
    }

    select {
      padding: 0 10px;
      cursor: pointer;
    }

    .count {
      min-width: max-content;
      color: #777;
      font-size: 13px;
    }

    .grid {
      display: grid;
      grid-template-columns:
        repeat(auto-fill, minmax(140px, 1fr));
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

    figure[hidden] {
      display: none;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 120px;
      color: #fff;
      background: #080808;
    }

    .icon svg {
      width: var(--icon-size);
      height: var(--icon-size);
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

    @media (max-width: 720px) {
      header {
        align-items: stretch;
        flex-direction: column;
      }

      .controls {
        width: 100%;
        max-width: none;
        margin-left: 0;
      }

      .count {
        display: none;
      }
    }
  </style>
</head>

<body>
  <header>
    <div class="title">
      <h1>Pixel Icon Preview</h1>
      <div class="source">${sourceName}</div>
    </div>

    ${
      files.length > 0
        ? `
          <div class="controls">
            <input
              id="search"
              type="search"
              placeholder="Search icons..."
              autocomplete="off"
            />

            <select id="size" aria-label="Icon size">
              <option value="16">16px</option>
              <option value="24">24px</option>
              <option value="32" selected>32px</option>
              <option value="48">48px</option>
            </select>
          </div>
        `
        : ""
    }

    <span class="count" id="count">
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
          No SVG files found in ${sourceName}/
        </div>
      `
  }

  <script>
    const search = document.querySelector("#search");
    const size = document.querySelector("#size");
    const count = document.querySelector("#count");
    const cards = Array.from(
      document.querySelectorAll("figure[data-icon-name]"),
    );

    const updateSearch = () => {
      const query = (search?.value ?? "")
        .trim()
        .toLowerCase();

      let visible = 0;

      for (const card of cards) {
        const name = card.dataset.iconName ?? "";
        const matches = name.includes(query);

        card.hidden = !matches;

        if (matches) {
          visible += 1;
        }
      }

      if (count) {
        count.textContent =
          query.length > 0
            ? \`\${visible} / \${cards.length} icons\`
            : \`\${cards.length} icon\${cards.length === 1 ? "" : "s"}\`;
      }
    };

    search?.addEventListener("input", updateSearch);

    size?.addEventListener(
      "change",
      () => {
        document.documentElement.style.setProperty(
          "--icon-size",
          \`\${size.value}px\`,
        );
      },
    );
  </script>
</body>
</html>`;

  await fs.writeFile(outputFile, html, "utf8");

  console.log(`Preview updated: ${outputFile}`);
  console.log(`Source: ${inputDir}`);
};

const currentFile = fileURLToPath(import.meta.url);
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
