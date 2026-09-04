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

// Orval names the getAssessment query type GetAssessmentParams, which clashes
// with its runtime path-parameter schema of the same name. The query type is
// exported by the React client; omit the duplicate from the Zod type barrel.
const zodTypesIndex = path.resolve(import.meta.dirname, "../api-zod/src/generated/types/index.ts");
const zodTypesSource = await readFile(zodTypesIndex, "utf8");
await writeFile(zodTypesIndex, `${zodTypesSource.replace("export * from './getAssessmentParams';\n", "").trimEnd()}\n`);