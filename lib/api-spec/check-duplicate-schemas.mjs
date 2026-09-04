import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const defaultSpecPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "openapi.yaml",
);
const specPath = path.resolve(process.argv[2] ?? defaultSpecPath);
const source = await readFile(specPath, "utf8");

function mappingKey(line) {
  const indentation = line.match(/^[ ]*/)[0].length;
  const content = line.slice(indentation);

  if (!content || content.startsWith("#") || content.startsWith("-")) {
    return null;
  }

  let quote = null;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (quote) {
      if (character === quote) {
        if (quote === "'" && content[index + 1] === "'") {
          index += 1;
        } else if (content[index - 1] !== "\\") {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === ":") {
      const rawKey = content.slice(0, index).trim();
      if (!rawKey) return null;

      if (rawKey.startsWith('"')) return JSON.parse(rawKey);
      if (rawKey.startsWith("'")) {
        return rawKey.slice(1, -1).replaceAll("''", "'");
      }
      return rawKey;
    }
  }

  return null;
}

const schemaBlocks = [];
const schemaDeclarations = new Map();
const duplicates = [];

for (const [index, line] of source.split(/\r?\n/u).entries()) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;

  const indentation = line.match(/^[ ]*/)[0].length;

  while (
    schemaBlocks.length > 0 &&
    indentation <= schemaBlocks.at(-1).indentation
  ) {
    schemaBlocks.pop();
  }

  const key = mappingKey(line);
  const activeBlock = schemaBlocks.at(-1);

  if (
    activeBlock &&
    activeBlock.childIndentation === null &&
    indentation > activeBlock.indentation &&
    key
  ) {
    activeBlock.childIndentation = indentation;
  }

  if (activeBlock && indentation === activeBlock.childIndentation && key) {
    const previousLine = schemaDeclarations.get(key);
    if (previousLine) {
      duplicates.push({ key, previousLine, line: index + 1 });
    } else {
      schemaDeclarations.set(key, index + 1);
    }
  }

  if (key === "schemas") {
    schemaBlocks.push({
      indentation,
      childIndentation: null,
    });
  }
}

if (duplicates.length > 0) {
  console.error(`Duplicate schema declarations found in ${specPath}:`);
  for (const duplicate of duplicates) {
    console.error(
      `- "${duplicate.key}" on line ${duplicate.line} (first declared on line ${duplicate.previousLine})`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(`No duplicate schema declarations found in ${specPath}.`);
}