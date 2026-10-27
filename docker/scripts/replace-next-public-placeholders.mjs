#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rewriteFlight, rewriteHtml } from "./replace-in-prerender.mjs";

const roots = ["apps/web/.next", "apps/web/public"];
const placeholderPattern = /http:\/\/NEXT_PUBLIC_[A-Z0-9_]+_PLACEHOLDER|NEXT_PUBLIC_[A-Z0-9_]+_PLACEHOLDER/g;

const files = [];
for (const root of roots) await collectFiles(root, files);

for (const file of files) {
  const original = await readFile(file);
  const text = original.toString("utf8");
  const placeholders = [...new Set(text.match(placeholderPattern) ?? [])];
  if (placeholders.length === 0) continue;

  const replacements = placeholders.map((placeholder) => {
    const envName = placeholder
      .replace(/^http:\/\//, "")
      .replace(/_PLACEHOLDER$/, "");
    return {
      placeholder,
      value: process.env[envName] ?? "",
      envName,
    };
  });

  let updated;
  if (file.endsWith(".rsc")) {
    updated = original;
    for (const { placeholder, value } of replacements) {
      updated = rewriteFlight(updated, placeholder, value).bytes;
    }
  } else if (file.endsWith(".html")) {
    updated = text;
    for (const { placeholder, value } of replacements) {
      updated = rewriteHtml(updated, placeholder, value);
    }
  } else {
    updated = text;
    for (const { placeholder, value } of replacements) {
      updated = updated.split(placeholder).join(value);
    }
  }

  await writeFile(file, updated);
  for (const { envName } of replacements) {
    console.log(`Replaced ${envName} runtime placeholder.`);
  }
}

async function collectFiles(directory, result) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(file, result);
    else if (entry.isFile()) result.push(file);
  }
}
