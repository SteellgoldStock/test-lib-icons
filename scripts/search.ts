import { findNearest } from "../src/lib.js";
const query=process.argv.slice(2).join(" ").trim();
if(!query){console.error('Usage: pnpm search "locked folder"');process.exit(1);}
for(const m of await findNearest(query,8)) console.log(`${m.score.toFixed(4)}  ${m.name}`);
