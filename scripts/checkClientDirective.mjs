#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd(), "src");

const hookPattern =
  /\buse(State|Effect|Memo|Callback|Transition|LayoutEffect|Reducer|ImperativeHandle|Ref|Context|InsertionEffect)\b/;

const directivePattern = /^\s*['"]use client['"]\s*;?/;

const ignoredDirs = new Set(["node_modules", ".next", ".git"]);

const filesMissingDirective = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
    } else if (entry.isFile() && fullPath.endsWith(".tsx")) {
      await checkFile(fullPath);
    }
  }
}

async function checkFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");

  if (!hookPattern.test(content)) {
    return;
  }

  const trimmed = content.replace(/^\uFEFF/, "").trimStart();

  if (directivePattern.test(trimmed)) {
    return;
  }

  filesMissingDirective.push(path.relative(process.cwd(), filePath));
}

try {
  await walk(projectRoot);

  if (filesMissingDirective.length > 0) {
    console.error(
      "Detected client-side hooks in components without the `\"use client\"` directive:",
    );
    for (const file of filesMissingDirective) {
      console.error(` - ${file}`);
    }
    console.error(
      "Add `\"use client\";` at the top of the file (before any imports) to mark it as a Client Component.",
    );
    process.exit(1);
  }
} catch (error) {
  console.error("Failed to run client directive check:", error);
  process.exit(1);
}

