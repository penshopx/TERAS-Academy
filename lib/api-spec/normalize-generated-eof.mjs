import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const generatedFiles = [
  path.resolve(import.meta.dirname, "../api-client-react/src/generated/api.ts"),
  path.resolve(import.meta.dirname, "../api-client-react/src/generated/api.schemas.ts"),
  path.resolve(import.meta.dirname, "../api-zod/src/generated/api.ts"),
];

await Promise.all(generatedFiles.map(async (file) => {
  const source = await readFile(file, "utf8");
  await writeFile(file, `${source.trimEnd()}\n`);
}));