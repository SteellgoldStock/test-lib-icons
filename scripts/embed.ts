import { embed, embeddingText, loadIcons, saveIcons } from "../src/lib.js";
const icons=await loadIcons();
for(let i=0;i<icons.length;i++){
  const icon=icons[i];
  if(!icon.embedding){
    process.stdout.write(`[${i+1}/${icons.length}] ${icon.name} ... `);
    icon.embedding=await embed(embeddingText(icon));
    await saveIcons(icons);
    console.log("done");
  }
}
console.log(`Embedded ${icons.length} icons.`);
