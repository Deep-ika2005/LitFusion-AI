#!/usr/bin/env node
/**
 * Builds the local journal-quartile registry (data/journal-quartiles.json) from
 * verified SCImago Journal & Country Rank CSV exports and/or Clarivate JCR exports.
 *
 * The registry is keyed by normalized ISSN (digits only, e.g. "00280836") and is
 * the primary offline evidence source used by src/lib/verification/quartile.ts.
 * Only ISSNs present in the exports receive a quartile — nothing is inferred from
 * journal names, publishers, or citation counts.
 *
 * SCImago specifics handled here:
 *   - Files are semicolon-delimited with quoted fields (delimiter auto-detected
 *     per file; legacy comma-delimited files still work).
 *   - SCImago exports carry no explicit Year column, so the year is read from
 *     the filename (e.g. "scimagojr 2025.csv" -> 2025). An explicit Year column
 *     always takes precedence when present.
 *   - The Categories field holds per-category quartiles, e.g.
 *     "Hematology (Q1); Oncology (Q2)". Each category keeps its OWN quartile —
 *     the "SJR Best Quartile" column is only the journal's best across
 *     categories and is never copied onto every category.
 *   - History is preserved per ISSN per year: importing another year merges
 *     into the existing registry instead of overwriting it. Re-importing the
 *     same year is idempotent.
 *
 * Backwards compatibility: every ISSN entry keeps the flat legacy shape
 * ({ quartile, title, category, year, provenance }) describing the latest known
 * year, which is exactly what verifyQuartile() reads. Per-year and per-category
 * detail accumulates in the additive `years` and `categories` fields.
 *
 * Usage:
 *   Single file (legacy):
 *     npm run quartile:registry -- <export.csv> [--out data/journal-quartiles.json]
 *   Multiple files (merged in order):
 *     npm run quartile:registry -- <2024.csv> <2025.csv> [--out data/journal-quartiles.json]
 *   Whole directory (all *.csv, alphabetical order):
 *     npm run quartile:registry -- --dir <folder> [--out data/journal-quartiles.json]
 *   Rebuild from scratch instead of merging with the existing registry:
 *     npm run quartile:registry -- --dir <folder> --fresh
 *
 * Expected columns (aliases in parentheses):
 *   Title (Journal Name, Source Title)
 *   ISSN (Issn, Print ISSN, P-ISSN) — may contain "1234-5678, 8765-4321"
 *   SJR Best Quartile (Best Quartile, Quartile, SJR Quartile, JCR Quartile)
 *   Categories (Category, Subject Category, Subject Area, Areas)
 *   Year (Coverage Year, Quartile Year) — optional; filename year is the fallback
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function readFlag(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

const outValue = readFlag("--out");
const output = outValue || "data/journal-quartiles.json";
const dirValue = readFlag("--dir");
const fresh = args.includes("--fresh");
const inputFiles = args.filter((arg) => !arg.startsWith("--") && arg !== outValue && arg !== dirValue);

let files = [...inputFiles];
if (dirValue) {
  let entries = [];
  try {
    entries = fs.readdirSync(dirValue);
  } catch (cause) {
    console.error(`Cannot read directory ${dirValue}: ${cause instanceof Error ? cause.message : cause}`);
    process.exit(1);
  }
  const csvFiles = entries
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => path.join(dirValue, name));
  if (csvFiles.length === 0) {
    console.error(`No .csv files found in ${dirValue}`);
    process.exit(1);
  }
  files.push(...csvFiles);
}

if (files.length === 0) {
  console.error("Usage: npm run quartile:registry -- <export.csv> [more.csv ...] [--dir <folder>] [--out data/journal-quartiles.json] [--fresh]");
  process.exit(1);
}

/**
 * Quote-aware CSV parser with a configurable delimiter. Handles RFC-4180
 * doubled quotes ("" -> ") and newlines inside quoted fields.
 */
function parseCsv(text, delimiter) {
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
    else if (char === delimiter) {
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

/** SCImago uses ";", legacy/JCR-style exports use "," — detect per file from its header line. */
function detectDelimiter(headerLine) {
  const withoutQuotes = headerLine.replace(/"[^"]*"/g, "");
  const semicolons = (withoutQuotes.match(/;/g) || []).length;
  const commas = (withoutQuotes.match(/,/g) || []).length;
  return semicolons > 0 && semicolons >= commas ? ";" : ",";
}

const normalizeIssn = (value) => {
  const cleaned = String(value || "").trim().toUpperCase().replace(/[^0-9X]/g, "");
  return /^\d{7}[\dX]$/.test(cleaned) ? cleaned : null;
};

/** An ISSN cell may hold several ISSNs ("1234-5678, 8765-4321" or "12345678 / 87654321"). */
const splitIssns = (value) =>
  String(value || "")
    .split(/[,;/|\s]+/)
    .map(normalizeIssn)
    .filter(Boolean);

const normalizeQuartile = (value) => {
  const v = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (["Q1", "QUARTILE1", "1", "1STQUARTILE"].includes(v)) return "Q1";
  if (["Q2", "QUARTILE2", "2"].includes(v)) return "Q2";
  if (["Q3", "QUARTILE3", "3"].includes(v)) return "Q3";
  if (["Q4", "QUARTILE4", "4"].includes(v)) return "Q4";
  return null;
};

/**
 * Parse a SCImago Categories cell such as "Hematology (Q1); Oncology (Q2)" into
 * per-category records. A category WITHOUT an explicit "(Qn)" annotation keeps
 * quartile: null — the journal's best quartile is never copied onto it.
 * Names may themselves contain parentheses ("Medicine (miscellaneous) (Q1)"),
 * so only a trailing (Q1-Q4) group is treated as the quartile.
 */
const parseCategories = (value, year) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.*)\s+\(Q([1-4])\)\s*$/i.exec(part);
      if (match) {
        return { name: match[1].trim(), quartile: `Q${match[2].toUpperCase()}`, year };
      }
      return { name: part, quartile: null, year };
    })
    .filter((entry) => entry.name.length > 0);
};

/** "scimagojr 2025.csv" -> 2025. Used only when the CSV has no explicit Year column. */
const yearFromFilename = (filePath) => {
  const match = /((?:19|20)\d{2})/.exec(path.basename(filePath));
  return match ? Number(match[1]) : null;
};

const headerAliases = {
  title: ["title", "journal name", "source title", "journal", "source"],
  issn: ["issn", "print issn", "p-issn", "e-issn", "eissn", "issn-l"],
  quartile: ["sjr best quartile", "best quartile", "quartile", "sjr quartile", "jcr quartile", "journal quartile"],
  category: ["categories", "category", "subject category", "subject area", "subject categories", "areas", "area"],
  year: ["year", "coverage year", "quartile year", "sjr year", "jcr year"],
};

const resolveColumn = (headers, aliases) => {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
};

const isBetterQuartile = (candidate, current) => !current || candidate < current;

/** Parse one export file into per-ISSN records. Never touches the registry. */
function parseExportFile(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const firstLine = rawText.split("\n", 1)[0] ?? "";
  const rows = parseCsv(rawText, detectDelimiter(firstLine));
  if (rows.length < 2) {
    return { records: new Map(), skipped: 0, invalidQuartile: 0, rows: 0, error: "no data rows" };
  }

  const headers = rows[0];
  const columns = {
    title: resolveColumn(headers, headerAliases.title),
    issn: resolveColumn(headers, headerAliases.issn),
    quartile: resolveColumn(headers, headerAliases.quartile),
    category: resolveColumn(headers, headerAliases.category),
    year: resolveColumn(headers, headerAliases.year),
  };

  if (columns.issn < 0) {
    return { records: new Map(), skipped: 0, invalidQuartile: 0, rows: 0, error: `no ISSN column (found: ${headers.join("|")})` };
  }
  if (columns.quartile < 0) {
    return { records: new Map(), skipped: 0, invalidQuartile: 0, rows: 0, error: `no quartile column (found: ${headers.join("|")})` };
  }

  const fallbackYear = columns.year < 0 ? yearFromFilename(filePath) : null;
  const records = new Map();
  let skipped = 0;
  let invalidQuartile = 0;

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const issns = splitIssns(cells[columns.issn]);
    if (issns.length === 0) {
      skipped++;
      continue;
    }
    const columnQuartile = normalizeQuartile(cells[columns.quartile]);
    if (!columnQuartile) {
      invalidQuartile++;
      continue;
    }
    let year = null;
    if (columns.year >= 0) {
      const yearMatch = /(\d{4})/.exec(String(cells[columns.year] ?? ""));
      year = yearMatch ? Number(yearMatch[1]) : null;
    } else {
      year = fallbackYear;
    }
    const categories = columns.category >= 0 ? parseCategories(cells[columns.category], year) : [];
    const title = columns.title >= 0 ? cells[columns.title]?.trim() || null : null;
    const provenance = `SCImago/JCR export: ${path.basename(filePath)}`;
    // The journal's best is the best verified quartile across the SJR Best
    // Quartile column and every annotated category — the column is authoritative
    // journal-wide, but a category annotation is equally verified evidence.
    let bestQuartile = columnQuartile;
    for (const category of categories) {
      const tier = normalizeQuartile(category.quartile);
      if (tier && isBetterQuartile(tier, bestQuartile)) bestQuartile = tier;
    }

    for (const issn of issns) {
      const existing = records.get(issn);
      if (!existing || isBetterQuartile(bestQuartile, existing.quartile)) {
        records.set(issn, { issn, quartile: bestQuartile, title, year, provenance, categories });
      } else if (existing) {
        // Same ISSN twice in one file: union the categories, keep the best quartile.
        const seen = new Set(existing.categories.map((c) => `${c.year ?? ""}|${c.name}|${c.quartile ?? ""}`));
        for (const category of categories) {
          const key = `${category.year ?? ""}|${category.name}|${category.quartile ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            existing.categories.push(category);
          }
        }
        if (!existing.title && title) existing.title = title;
      }
    }
  }

  return { records, skipped, invalidQuartile, rows: rows.length - 1 };
}

const categoryKey = (c) => `${c.year ?? ""}|${c.name}|${c.quartile ?? ""}`;

function unionCategories(target, additions) {
  const seen = new Set(target.map(categoryKey));
  for (const category of additions) {
    const key = categoryKey(category);
    if (!seen.has(key)) {
      seen.add(key);
      target.push({ name: category.name, quartile: category.quartile ?? null, year: category.year ?? null });
    }
  }
}

function toYearRecord(record) {
  return {
    quartile: record.quartile,
    title: record.title,
    provenance: record.provenance,
    categories: record.categories.map((c) => ({ name: c.name, quartile: c.quartile ?? null, year: c.year ?? null })),
  };
}

/**
 * Merge one file's record into a stored ISSN entry. History accumulates per
 * year; only the flat legacy fields (quartile/category/year/title/provenance,
 * describing the latest known year) are refreshed. Unrelated years and
 * unrelated ISSNs are never touched.
 */
function mergeRecord(entry, record) {
  entry.years = entry.years && typeof entry.years === "object" ? entry.years : {};
  entry.categories = Array.isArray(entry.categories) ? entry.categories : [];

  if (record.year !== null) {
    entry.years[String(record.year)] = toYearRecord(record);
    unionCategories(entry.categories, record.categories);
    // Flat legacy fields always describe the latest known year.
    const knownYears = Object.keys(entry.years).map(Number).filter(Number.isFinite);
    const latestYear = knownYears.length > 0 ? Math.max(...knownYears) : record.year;
    const latest = entry.years[String(latestYear)];
    entry.quartile = latest.quartile;
    entry.year = latestYear;
    entry.title = latest.title ?? entry.title ?? null;
    entry.provenance = latest.provenance ?? entry.provenance ?? null;
    entry.category = latest.categories[0]?.name ?? entry.category ?? null;
  } else {
    // Undated import: only fill gaps, never clobber dated history.
    const hasDatedHistory = Object.keys(entry.years).length > 0 || typeof entry.year === "number";
    unionCategories(entry.categories, record.categories);
    if (!hasDatedHistory) {
      if (isBetterQuartile(record.quartile, entry.quartile)) {
        entry.quartile = record.quartile;
        entry.provenance = record.provenance;
      }
      if (!entry.title && record.title) entry.title = record.title;
      if (!entry.category && record.categories[0]) entry.category = record.categories[0].name;
    }
    if (!entry.title && record.title) entry.title = record.title;
  }
  return entry;
}

function createEntry(record) {
  const entry = {
    quartile: record.quartile,
    title: record.title,
    category: record.categories[0]?.name ?? null,
    year: record.year,
    provenance: record.provenance,
    categories: [],
    years: {},
  };
  if (record.year !== null) {
    entry.years[String(record.year)] = toYearRecord(record);
  }
  unionCategories(entry.categories, record.categories);
  return entry;
}

// Load the existing registry so history merges instead of being overwritten,
// unless --fresh explicitly asks for a rebuild from scratch.
let quartiles = {};
if (!fresh) {
  try {
    const existing = JSON.parse(fs.readFileSync(output, "utf8"));
    if (existing && typeof existing.quartiles === "object") {
      quartiles = existing.quartiles;
    }
  } catch {
    quartiles = {};
  }
}

let totalSkipped = 0;
let totalInvalidQuartile = 0;
let totalRows = 0;
let totalNewIssns = 0;
const sources = [];

for (const file of files) {
  const parsed = parseExportFile(file);
  if (parsed.error) {
    console.error(`Skipping ${file}: ${parsed.error}`);
    continue;
  }
  sources.push(path.basename(file));
  totalSkipped += parsed.skipped;
  totalInvalidQuartile += parsed.invalidQuartile;
  totalRows += parsed.rows;
  for (const record of parsed.records.values()) {
    const existing = quartiles[record.issn];
    if (!existing) {
      totalNewIssns++;
      quartiles[record.issn] = createEntry(record);
    } else {
      quartiles[record.issn] = mergeRecord(existing, record);
    }
  }
  console.log(
    `  ${path.basename(file)}: ${parsed.records.size} ISSNs from ${parsed.rows} rows` +
      (parsed.skipped ? ` (${parsed.skipped} skipped: missing/invalid ISSN` : "") +
      (parsed.invalidQuartile ? `${parsed.skipped ? ", " : " ("}${parsed.invalidQuartile} skipped: unrecognized quartile)` : parsed.skipped ? ")" : "")
  );
}

const registry = {
  meta: {
    source: sources.length > 0 ? `Verified exports: ${sources.join(", ")}` : "Verified SCImago SJR or Clarivate JCR export (user-supplied)",
    generatedAt: new Date().toISOString(),
    entryCount: Object.keys(quartiles).length,
  },
  quartiles,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(registry, null, 2)}\n`);

console.log(
  `Wrote ${Object.keys(quartiles).length} quartile entries (${totalNewIssns} new ISSNs, ${totalRows} rows from ${sources.length} file(s)) to ${output}` +
    (totalSkipped ? ` (${totalSkipped} rows skipped: missing/invalid ISSN` : "") +
    (totalInvalidQuartile ? `${totalSkipped ? ", " : " ("}${totalInvalidQuartile} rows skipped: unrecognized quartile)` : totalSkipped ? ")" : "")
);
