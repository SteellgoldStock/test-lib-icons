import fs from "node:fs/promises";
import path from "node:path";
import { client, findNearest, generationModel, readSvg, root } from "../src/lib.js";

const request=process.argv.slice(2).join(" ").trim();
if(!request){console.error('Usage: pnpm generate "empty favorites list"');process.exit(1);}
const refs=await findNearest(request,8);
const referenceText=(await Promise.all(refs.map(async i=>`REFERENCE: ${i.name}\n${await readSvg(i.file)}`))).join("\n\n");

const instructions=`You generate production-ready SVG pixel icons.
Reproduce the visual language of the supplied reference library, not merely the subject matter.
Hard constraints:
- viewBox exactly "0 0 24 24"
- width="24" and height="24"
- pixel-art geometry
- crisp orthogonal geometry; no rounded corners
- no Bézier curves, arcs, filters, gradients, masks, raster images, text, or transforms
- use currentColor
- prefer the same SVG/path conventions, spacing, visual weight, negative space, and pixel rhythm as the references
- integer-aligned coordinates whenever possible
- output one standalone SVG only
- no Markdown fences and no explanation
The icon must remain recognizable at 24x24.`;

const r=await client.responses.create({
  model:generationModel,
  instructions,
  input:`NEW ICON REQUEST:\n${request}\n\nCLOSEST LIBRARY REFERENCES:\n${referenceText}`
});
let svg=r.output_text.trim().replace(/^```(?:svg)?\s*/i,"").replace(/\s*```$/i,"").trim();
if(!svg.startsWith("<svg")||!svg.endsWith("</svg>")) throw new Error("Model did not return standalone SVG.");
if(!/viewBox=["']0 0 24 24["']/.test(svg)) throw new Error('SVG must use viewBox="0 0 24 24".');
if(/(<text\b|<image\b|<filter\b|<linearGradient\b|<radialGradient\b|<mask\b|<foreignObject\b)/i.test(svg)) throw new Error("Forbidden SVG element.");
const slug=request.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,64)||"generated-icon";
const output=path.join(root,"output",`${slug}.svg`);
await fs.writeFile(output,svg+"\n","utf8");
console.log(`Generated: ${output}`);
console.log("References:");
for(const ref of refs) console.log(`- ${ref.name} (${ref.score.toFixed(4)})`);
