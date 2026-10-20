#!/usr/bin/env node
/**
 * Builds the local Scopus source registry (data/scopus-sources.json) from a
 * Scopus-derived export such as the SCImago Journal & Country Rank CSV.
 *
 * The registry is keyed by ISSN / ISSN-L and is the second (offline) evidence source
 * used by src/lib/verification/scopus.ts. Only sources that the export lists as being
 * in Scopus end up in the file — nothing is inferred from journal names.
 *
 * Usage:
 *   npm run scopus:registry -- <export.csv> [--out data/scopus-sources.json]
 *
 * Expected columns (aliases in parentheses):
 *   Title (Journal Name, Source Title)
 *   ISSN
 *   Publisher
 * Optional: ISSN-L, Country, SJR, H index
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith("--"));
const outIndex = args.indexOf("--out");
const output = outIndex >= 0 ? args[outIndex + 1] : "data/scopus-sources.json";

if (!input) {
  console.error("Usage: npm run scopus:registry -- <export.csv> [--out data/scopus-sources.json]");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const normalizeIssn = (value) => {
  const cleaned = String(value || "").trim().toUpperCase().replace(/[^0-9X]/g, "");
  return /^\d{7}[\dX]$/.test(cleaned) ? cleaned : null;
};

const headerAliases = {
  title: ["title", "journal name", "source title", "journal", "source"],
  issn: ["issn"],
  issnL: ["issn-l", "issn l", "issnlink", "issn link"],
  publisher: ["publisher"],
};

const resolveColumn = (headers, aliases) => {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
};

const csv = fs.readFileSync(input, "utf8");
const rows = parseCsv(csv);
if (rows.length < 2) {
  console.error(`No data rows found in ${input}`);
  process.exit(1);
}

const headers = rows[0];
const columns = {
  title: resolveColumn(headers, headerAliases.title),
  issn: resolveColumn(headers, headerAliases.issn),
  issnL: resolveColumn(headers, headerAliases.issnL),
  publisher: resolveColumn(headers, headerAliases.publisher),
};

if (columns.issn < 0) {
  console.error(`Could not find an ISSN column in ${input}. Columns found: ${headers.join(", ")}`);
  process.exit(1);
}

const sources = {};
let skipped = 0;

for (let i = 1; i < rows.length; i++) {
  const cells = rows[i];
  const issn = normalizeIssn(cells[columns.issn]);
  const issnL = columns.issnL >= 0 ? normalizeIssn(cells[columns.issnL]) : null;
  if (!issn) {
    skipped++;
    continue;
  }
  const entry = {
    title: columns.title >= 0 ? cells[columns.title]?.trim() || null : null,
    publisher: columns.publisher >= 0 ? cells[columns.publisher]?.trim() || null : null,
  };
  // A journal can be registered under both its print and electronic ISSN.
  sources[issn] = { ...entry };
  if (issnL && issnL !== issn) sources[issnL] = { ...entry };
}

const file = {
  meta: {
    source: `Scopus-derived export: ${path.basename(input)}`,
    generatedAt: new Date().toISOString(),
    entryCount: Object.keys(sources).length,
  },
  sources,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(file, null, 2)}\n`);

console.log(
  `Wrote ${Object.keys(sources).length} Scopus sources to ${output}` +
    (skipped ? ` (${skipped} rows skipped: missing/invalid ISSN)` : "")
);
