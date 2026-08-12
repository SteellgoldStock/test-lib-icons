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
  outputName = "preview.html",
  sourceLabel?: string,
  outputPath?: string,
): Promise<void> => {
  const inputDir = resolveInputDir(inputPath);
  const outputDir = outputPath
    ? resolveInputDir(outputPath)
    : inputDir;

  const outputFile = path.join(
    outputDir,
    outputName,
  );

  await fs.mkdir(inputDir, {
    recursive: true,
  });

  await fs.mkdir(outputDir, {
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

  const sourceName = escapeHtml(
    sourceLabel ?? path.basename(inputDir),
  );

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
    <title>Pixel Icon Preview ${sourceLabel ? `(${sourceLabel})` : ""}</title>

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

    .fill-mode {
      min-width: 118px;
    }

    .fill-switch {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #8f8f8f;
      font-size: 12px;
      user-select: none;
    }

    .fill-switch input {
      position: absolute;
      z-index: 1;
      opacity: 0;
      width: 44px;
      height: 22px;
      margin: 0;
      cursor: pointer;
    }

    .switch-control {
      --track-width: 44px;
      --track-height: 22px;
      --thumb-size: 16px;
      display: inline-block;
      position: relative;
      width: var(--track-width);
      height: var(--track-height);
      border-radius: 999px;
      background: #252525;
      border: 1px solid #3c3c3c;
      cursor: pointer;
    }

    .switch-control::before {
      content: "";
      position: absolute;
      top: 2px;
      left: 3px;
      width: var(--thumb-size);
      height: var(--thumb-size);
      border-radius: 50%;
      background: #8c8c8c;
      transition: transform 0.2s ease;
    }

    .fill-toggle:checked + .switch-control {
      background: #2b5fff;
      border-color: #5c7dff;
    }

    .fill-toggle:checked + .switch-control::before {
      transform: translateX(20px);
      background: #f2f4ff;
    }

    .switch-control:focus-visible {
      border-color: #7a7a7a;
    }

    .fill-state {
      min-width: 24px;
      color: #afafaf;
      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
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

            <label class="fill-switch">
              <span>Fill</span>
              <input
                id="fillToggle"
                class="fill-toggle"
                type="checkbox"
                aria-label="Toggle fill mode"
              />
              <span class="switch-control" aria-hidden="true"></span>
              <span class="fill-state" id="fillState">OFF</span>
            </label>
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
    const fillToggle = document.querySelector(
      "#fillToggle",
    );
    const fillState = document.querySelector("#fillState");
    const count = document.querySelector("#count");
    const cards = Array.from(
      document.querySelectorAll("figure[data-icon-name]"),
    );
    const iconSvgs: Array<{ svg: SVGElement; defaultFill: string | null }> =
      [];

    for (const card of cards) {
      const svg = card.querySelector("svg");

      if (!(svg instanceof SVGElement)) {
        continue;
      }

      iconSvgs.push({
        svg,
        defaultFill: svg.getAttribute("fill"),
      });
    }

    const applyFillMode = () => {
      const isFilled =
        fillToggle instanceof HTMLInputElement
          ? fillToggle.checked
          : false;

      for (const icon of iconSvgs) {
        if (icon.defaultFill === null) {
          if (isFilled) {
            icon.svg.setAttribute("fill", "currentColor");
          } else {
            icon.svg.removeAttribute("fill");
          }
          continue;
        }

        icon.svg.setAttribute(
          "fill",
          isFilled ? "currentColor" : icon.defaultFill,
        );
      }
    };

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

    fillToggle?.addEventListener("change", applyFillMode);
    if (fillState) {
      fillState.textContent = "OFF";
    }
    applyFillMode();
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
