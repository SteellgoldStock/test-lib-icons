import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

type FillRegressionGroup = {
  attrs: string;
  body: string;
};

const root = process.cwd();
const iconscript = resolve(
  root,
  "scripts",
  "build-lucide.ts",
);
const tsx = resolve(
  root,
  "node_modules",
  ".bin",
  "tsx",
);

const closedIcons = [
  "heart",
  "star",
  "bookmark",
  "circle",
  "shield",
  "badge",
];

const openIcons = [
  "arrow-left",
  "menu",
  "chevron-right",
];

const splitGroups = (svg: string): FillRegressionGroup[] => {
  const groups = Array.from(
    svg.matchAll(
      /<g([^>]*)>([\s\S]*?)<\/g>/g,
    ),
  );

  return groups.map((match) => ({
    attrs: match[1] ?? "",
    body: match[2] ?? "",
  }));
};

const isFillGroup = (group: FillRegressionGroup): boolean =>
  !/\bfill\s*=/.test(group.attrs) &&
  /<(path|circle|ellipse|rect|polygon|polyline)\b/i.test(group.body);

const isOutlineGroup = (
  group: FillRegressionGroup,
): boolean =>
  /\bfill="currentColor"/.test(group.attrs) &&
  /<(path|rect|circle|ellipse|polygon|polyline|line)\b/i.test(group.body);

const outputPathForDensity = (
  outputRoot: string,
  density: number,
  iconName: string,
): string => {
  const folder = density === 24
    ? outputRoot
    : join(
        outputRoot,
        "densities",
        String(density),
      );

  return join(folder, `${iconName}.svg`);
};

const setupGeneratedIcons = async (
  outputRoot: string,
): Promise<void> => {
  const allIcons = [...closedIcons, ...openIcons].join(
    ",",
  );

  await execFileAsync(
    tsx,
    [
      iconscript,
      "--pixel",
      "--densities",
      "16,24,32",
      "--files",
      allIcons,
      "--output",
      outputRoot,
    ],
    { cwd: root },
  );
};

const countPaintedPixels = async (
  source: string,
  fillValue: "none" | "currentColor",
): Promise<number> => {
  const { PNG } = await import("pngjs");
  const { Resvg } = await import("@resvg/resvg-js");

  const svg = source.replace(
    /<svg\b([^>]*)>/i,
    (_match, attrs) => {
      const sanitizedAttrs = String(attrs).replace(
        /\s+fill\s*=\s*["'][^"']*["']/i,
        "",
      );

      return `<svg${sanitizedAttrs} fill="${fillValue}">`;
    },
  );

  const renderer = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: 1024,
    },
  });

  const png = PNG.sync.read(renderer.render().asPng());
  let painted = 0;

  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] > 0) {
      painted += 1;
    }
  }

  return painted;
};

const hasGeometry = (svg: string): boolean => {
  return /<\s*(?:path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*>/i.test(
    svg,
  );
};

const runCase = async (
  density: number,
  icon: string,
  outputRoot: string,
): Promise<string> => readFile(
    outputPathForDensity(outputRoot, density, icon),
    "utf8",
  );

test("Pixelized 16/24/32 keeps fillable interior separated from outline", async () => {
  const tempDir = await mkdtemp(
    join(tmpdir(), "lucide-fill-regression-"),
  );
  const outputRoot = join(tempDir, "icons");

  try {
    await setupGeneratedIcons(outputRoot);

    for (const density of [16, 24, 32]) {
      for (const icon of closedIcons) {
        const svg = await runCase(
          density,
          icon,
          outputRoot,
        );

        if (density === 16) {
          assert.match(
            svg,
            /<path|<rect|<circle|<line|<polyline|<polygon/,
            `${icon}@16 should still use vector geometry`,
          );
          assert.match(
            svg,
            /fill="none"/,
            `${icon}@16 should keep fill="none" by default`,
          );
          assert.ok(
            !/<path[^>]*fill=\"currentColor\"/.test(
              svg,
            ),
            `${icon}@16 should not hardcode child fill color`,
          );
          continue;
        }

        const groups = splitGroups(svg);
        assert.match(
          svg,
          /fill="none"/,
          `${icon}@${density} should keep fill="none" by default`,
        );
        assert.ok(
          /<path|<circle|<rect|<ellipse|<polygon|<polyline/.test(svg),
          `${icon}@${density} should include fill-capable geometry`,
        );
        assert.ok(
          groups.some(isFillGroup),
          `${icon}@${density} should expose a fillable interior group`,
        );
        assert.ok(
          groups.some(isOutlineGroup),
          `${icon}@${density} should expose an outline group`,
        );

        const paintedOutline = await countPaintedPixels(
          svg,
          "none",
        );
        const paintedFilled = await countPaintedPixels(
          svg,
          "currentColor",
        );

        assert.ok(
          paintedFilled > paintedOutline,
          `${icon}@${density} should increase painted pixels when fill is currentColor`,
        );
      }

      for (const icon of openIcons) {
        const svg = await runCase(
          density,
          icon,
          outputRoot,
        );

        if (density === 16) {
          assert.match(
            svg,
            /fill="none"/,
            `${icon}@16 should keep fill="none" by default`,
          );
          assert.ok(
            hasGeometry(svg),
            `${icon}@16 should keep vector geometry`,
          );
          continue;
        }

        const groups = splitGroups(svg);
        assert.match(
          svg,
          /fill="none"/,
          `${icon}@${density} should keep fill="none" by default`,
        );
        assert.ok(
          !groups.some(isFillGroup),
          `${icon}@${density} should not introduce a fill interior group`,
        );
        assert.ok(
          groups.some(isOutlineGroup),
          `${icon}@${density} should still expose an outline group`,
        );

        const paintedOutline = await countPaintedPixels(
          svg,
          "none",
        );
        const paintedFilled = await countPaintedPixels(
          svg,
          "currentColor",
        );

        assert.equal(
          paintedFilled,
          paintedOutline,
          `${icon}@${density} should not change paint when fill is currentColor`,
        );
      }
    }
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
});
