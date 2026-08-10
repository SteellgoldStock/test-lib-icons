import fs from "node:fs/promises";
import path from "node:path";

type IconRecord = {
  name: string;
  description: string;
  tags: string[];
  file: string;
  embedding: number[] | null;
};

const root = process.cwd();
const iconsDirectory = path.join(root, "icons");
const dataPath = path.join(root, "data", "icons.json");

const apply = process.argv.includes("--apply");

const toKebabCase = (name: string): string => {
  return name
    // Extension
    .replace(/\.svg$/i, "")

    // Remix Icon prefix
    .replace(/^Ri/, "")

    // Remix "Line" suffix = default variant
    .replace(/Line$/, "")

    // PascalCase → kebab-case
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")

    // Normalize
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
};

const main = async (): Promise<void> => {
  const raw = await fs.readFile(dataPath, "utf8");
  const icons = JSON.parse(raw) as IconRecord[];

  const renames = icons.map((icon) => {
    const oldFilename = path.basename(icon.file);
    const newName = toKebabCase(icon.name);
    const newFilename = `${newName}.svg`;

    return {
      icon,
      oldName: icon.name,
      newName,
      oldFilename,
      newFilename,
      oldPath: path.join(iconsDirectory, oldFilename),
      newPath: path.join(iconsDirectory, newFilename),
    };
  });

  // Prevent accidental overwrites.
  const names = new Map<string, string[]>();

  for (const rename of renames) {
    const existing = names.get(rename.newFilename) ?? [];
    existing.push(rename.oldFilename);
    names.set(rename.newFilename, existing);
  }

  const collisions = [...names.entries()].filter(
    ([, sources]) => sources.length > 1,
  );

  if (collisions.length > 0) {
    console.error("\n❌ Filename collisions detected:\n");

    for (const [target, sources] of collisions) {
      console.error(`${target}`);
      for (const source of sources) {
        console.error(`  ← ${source}`);
      }
    }

    console.error("\nNothing was modified.");
    process.exit(1);
  }

  console.log(`\n${apply ? "APPLY" : "DRY RUN"}\n`);

  for (const rename of renames) {
    console.log(
      `${rename.oldFilename.padEnd(32)} → ${rename.newFilename}`,
    );
  }

  if (!apply) {
    console.log(
      '\nNo files were modified. Run with "--apply" to apply these changes.',
    );

    return;
  }

  // Make a backup of icons.json.
  await fs.copyFile(dataPath, `${dataPath}.backup`);

  // Rename physical SVG files.
  for (const rename of renames) {
    if (rename.oldPath !== rename.newPath) {
      await fs.rename(rename.oldPath, rename.newPath);
    }

    rename.icon.name = rename.newName;
    rename.icon.file = `icons/${rename.newFilename}`;

    // IMPORTANT:
    // embedding is deliberately left untouched.
  }

  await fs.writeFile(
    dataPath,
    `${JSON.stringify(icons, null, 2)}\n`,
    "utf8",
  );

  console.log("\n✅ Done.");
  console.log("SVG files renamed.");
  console.log("icons.json updated.");
  console.log("Embeddings preserved.");
  console.log("Backup: data/icons.json.backup");
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});