import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const iconsDirectory = path.join(root, "icons");
const dataDirectory = path.join(root, "data");
const outputPath = path.join(dataDirectory, "icons.json");

const files = (await fs.readdir(iconsDirectory))
  .filter((file) => file.toLowerCase().endsWith(".svg"))
  .sort();

const icons = files.map((file) => {
  const name = file.replace(/\.svg$/i, "");

  const words = name
    .split("-")
    .filter(Boolean);

  return {
    name,
    description: `Pixel-art interface icon representing ${words.join(" ")}.`,
    tags: words,
    file: `icons/${file}`,
    embedding: null,
  };
});

await fs.mkdir(dataDirectory, {
  recursive: true,
});

await fs.writeFile(
  outputPath,
  `${JSON.stringify(icons, null, 2)}\n`,
  "utf8",
);

console.log(`Generated data/icons.json`);
console.log(`${icons.length} icons indexed.`);