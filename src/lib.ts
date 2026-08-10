import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import "dotenv/config";

export type IconRecord = { name:string; description:string; tags:string[]; file:string; embedding:number[]|null };
export const root = process.cwd();
export const dataPath = path.join(root, "data", "icons.json");
export const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const generationModel = process.env.OPENAI_GENERATION_MODEL ?? "gpt-5.1";
export const loadIcons = async (): Promise<IconRecord[]> => JSON.parse(await fs.readFile(dataPath,"utf8"));
export const saveIcons = async (icons:IconRecord[]) => fs.writeFile(dataPath,JSON.stringify(icons,null,2));
export const embeddingText = (i:IconRecord) => `${i.name}\n${i.description}\nTags: ${i.tags.join(", ")}`;
export const cosineSimilarity = (a:number[],b:number[]) => {
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return dot/(Math.sqrt(aa)*Math.sqrt(bb));
};
export const embed = async (input:string) => {
  const r=await client.embeddings.create({model:embeddingModel,input,encoding_format:"float"});
  return r.data[0].embedding;
};
export const findNearest = async (query:string,limit=8) => {
  const icons=await loadIcons();
  if(icons.some(i=>!i.embedding)) throw new Error('Missing embeddings. Run "pnpm embed" first.');
  const q=await embed(query);
  return icons.map(i=>({...i,score:cosineSimilarity(q,i.embedding!)})).sort((a,b)=>b.score-a.score).slice(0,limit);
};
export const readSvg = async (file:string) => fs.readFile(path.join(root,file),"utf8");
