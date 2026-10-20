/**
 * Tests for scripts/build-quartile-registry.mjs (SCImago multi-year import).
 *
 *   1. Semicolon-delimited files with quoted fields (titles containing ";").
 *   2. Multiple ISSNs in one cell (print + electronic).
 *   3. Per-category quartiles from Categories ("Hematology (Q1); Oncology (Q2)"):
 *      each category keeps its OWN quartile; SJR Best Quartile is never copied
 *      onto every category; categories without an annotation keep quartile null.
 *   4. Year extraction from filenames ("scimagojr 2025.csv") when no Year column.
 *   5. Explicit Year column takes precedence over the filename year.
 *   6. Multi-year merge: importing 2019 then 2025 preserves both years per ISSN,
 *      refreshes flat fields to the latest year, and never drops unrelated ISSNs.
 *   7. Same-year re-import is idempotent (no duplicate categories).
 *   8. Registry stays compatible with verifyQuartile(); unknown ISSNs are never
 *      fabricated a quartile.
 *
 * Run: npm run test:quartile-registry
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./test-resolver.mjs", import.meta.url);

const { verifyQuartile } = await import("../src/lib/verification/quartile.ts");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "quartile-registry-test-"));
const builder = fileURLToPath(new URL("./build-quartile-registry.mjs", import.meta.url));
const out = path.join(workdir, "registry.json");

function runBuilder(args, expectOk = true) {
  try {
    const output = execFileSync("node", [builder, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (!expectOk) {
      check(`builder unexpectedly succeeded (${args.join(" ")})`, false);
      return "";
    }
    return output;
  } catch (cause) {
    if (expectOk) {
      check(`builder run (${args.join(" ")})`, false, String(cause?.stderr ?? cause?.message ?? cause).slice(0, 300));
    }
    return "";
  }
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

console.log("\nLitFusion-AI — quartile registry builder matrix\n");

// --- 1+2+3+4: semicolons, quoted fields, multi-ISSN, categories, filename year -
console.log("SCImago format: semicolons, quotes, multi-ISSN, categories, filename year");
const scimago2025 = [
  "Rank; Sourceid; Title; Type; Issn; SJR; SJR Best Quartile; H index; Country; Publisher; Coverage; Categories; Areas",
  '1; 28773; Nature; journal; "0028-0836, 1476-4687"; 10.5; Q1; 500; United Kingdom; Nature Publishing Group; 1869-2025; "Medicine (miscellaneous) (Q1); Multidisciplinary (Q1)"; Medicine; Multidisciplinary',
  '2; 12345; "Journal of Testing; Advanced Studies"; journal; 1111-1111; 2.1; Q1; 40; United States; Test Press; 2000-2025; "Hematology (Q1); Oncology (Q2)"; Medicine',
  "3; 99999; No Quartile Journal; journal; 2222-2222; 0.1; -; 5; Unknown; Unknown; 2020-2025; Miscellaneous; Medicine",
].join("\n");
const file2025 = path.join(workdir, "scimagojr 2025.csv");
fs.writeFileSync(file2025, scimago2025, "utf8");
runBuilder([file2025, "--out", out]);
const reg = readRegistry();

check("semicolon file parsed (3 data rows -> 2 valid ISSNs, bad quartile skipped)", reg.meta.entryCount === 3, `entryCount=${reg.meta.entryCount}`);
check(
  "quoted title containing ';' stays one field",
  reg.quartiles["11111111"]?.title === "Journal of Testing; Advanced Studies",
  `title=${JSON.stringify(reg.quartiles["11111111"]?.title)}`
);
check("multiple ISSNs in one cell create both keys", Boolean(reg.quartiles["00280836"]) && Boolean(reg.quartiles["14764687"]));
const nature = reg.quartiles["00280836"];
check("filename year used when no Year column", nature?.year === 2025, `year=${nature?.year}`);
const testCats = reg.quartiles["11111111"]?.categories ?? [];
check(
  "per-category quartiles preserved (Q1 vs Q2, not best-copied)",
  testCats.some((c) => c.name === "Hematology" && c.quartile === "Q1" && c.year === 2025) &&
    testCats.some((c) => c.name === "Oncology" && c.quartile === "Q2" && c.year === 2025),
  JSON.stringify(testCats)
);
check("top-level quartile is the journal best (Q1)", reg.quartiles["11111111"]?.quartile === "Q1");
const miscCats = (nature?.categories ?? []).filter((c) => c.name === "Medicine (miscellaneous)");
check(
  "parenthesised names keep inner parens (Medicine (miscellaneous), Q1)",
  miscCats.length === 1 && miscCats[0].quartile === "Q1",
  JSON.stringify(nature?.categories)
);

// --- Category without annotation keeps quartile null ---------------------------
console.log("Unannotated categories are never assigned the best quartile");
const unannotated = [
  "Title,Issn,SJR Best Quartile,Categories,Year",
  '"Plain Journal",3333-3333,Q3,"General Medicine; Surgery (Q3)",2024',
].join("\n");
const fileUnannotated = path.join(workdir, "unannotated.csv");
fs.writeFileSync(fileUnannotated, unannotated, "utf8");
runBuilder([fileUnannotated, "--out", out]);
const reg2 = readRegistry();
const plainCats = reg2.quartiles["33333333"]?.categories ?? [];
check(
  "unannotated category keeps quartile null (not Q3)",
  plainCats.some((c) => c.name === "General Medicine" && c.quartile === null) &&
    plainCats.some((c) => c.name === "Surgery" && c.quartile === "Q3"),
  JSON.stringify(plainCats)
);

// --- 5: explicit Year column beats filename ------------------------------------
console.log("Explicit Year column takes precedence over filename");
const explicitYear = ["Title,Issn,SJR Best Quartile,Categories,Year", '"Dated Journal",4444-4444,Q4,"Cat (Q4)",2021'].join("\n");
const fileExplicit = path.join(workdir, "scimagojr 2099.csv");
fs.writeFileSync(fileExplicit, explicitYear, "utf8");
runBuilder([fileExplicit, "--out", out]);
const reg3 = readRegistry();
check("Year column (2021) wins over filename (2099)", reg3.quartiles["44444444"]?.year === 2021, `year=${reg3.quartiles["44444444"]?.year}`);

// --- 6: multi-year merge across runs -------------------------------------------
console.log("Multi-year merge preserves history and unrelated records");
const oldYear = [
  "Rank; Sourceid; Title; Type; Issn; SJR; SJR Best Quartile; H index; Country; Publisher; Coverage; Categories; Areas",
  '2; 12345; "Journal of Testing; Advanced Studies"; journal; 1111-1111; 1.2; Q3; 20; United States; Test Press; 2000-2019; "Hematology (Q3)"; Medicine',
].join("\n");
const file2019 = path.join(workdir, "scimagojr 2019.csv");
fs.writeFileSync(file2019, oldYear, "utf8");
runBuilder([file2019, "--out", out]);
const reg4 = readRegistry();
const merged = reg4.quartiles["11111111"];
check("both years preserved per ISSN", Boolean(merged?.years?.["2019"]) && Boolean(merged?.years?.["2025"]), `years=${Object.keys(merged?.years ?? {}).join(",")}`);
check("2019 year record keeps its own quartile (Q3)", merged?.years?.["2019"]?.quartile === "Q3");
check("flat fields describe the latest year (2025/Q1)", merged?.year === 2025 && merged?.quartile === "Q1", `year=${merged?.year} quartile=${merged?.quartile}`);
check(
  "2019 categories merged with their year",
  (merged?.categories ?? []).some((c) => c.name === "Hematology" && c.quartile === "Q3" && c.year === 2019),
  JSON.stringify(merged?.categories)
);
check("unrelated ISSN from earlier runs untouched (Nature still Q1/2025)", reg4.quartiles["00280836"]?.quartile === "Q1" && reg4.quartiles["00280836"]?.year === 2025);
check("unrelated undated record untouched (3333-3333 still Q3)", reg4.quartiles["33333333"]?.quartile === "Q3");

// --- 7: idempotent re-import ----------------------------------------------------
console.log("Same-year re-import is idempotent");
const before = JSON.stringify(reg4.quartiles["11111111"]);
runBuilder([file2025, "--out", out]);
const reg5 = readRegistry();
check("re-import leaves the ISSN entry unchanged", JSON.stringify(reg5.quartiles["11111111"]) === before);

// --- 8: verifier compatibility, no fabrication ----------------------------------
console.log("Verifier compatibility and honesty");
const hit = await verifyQuartile(
  { source: { issnL: "0028-0836", issnList: ["0028-0836", "1476-4687"], issn: "0028-0836" } },
  { allowNetwork: false, registry: reg5 }
);
check("verifyQuartile reads merged registry (Q1 + category + year)", hit.quartile === "Q1" && hit.year === 2025 && typeof hit.category === "string", JSON.stringify({ q: hit.quartile, c: hit.category, y: hit.year }));
const miss = await verifyQuartile(
  { source: { issnL: "9999-9999", issnList: ["9999-9999"], issn: "9999-9999" } },
  { allowNetwork: false, registry: reg5 }
);
check("unknown ISSN still Quartile unavailable (never fabricated)", miss.quartile === null && miss.label === "Quartile unavailable");

// --- legacy single-file comma command still works --------------------------------
console.log("Legacy comma-delimited single-file import");
const legacyOut = path.join(workdir, "legacy.json");
const legacy = ["Title,Issn,SJR Best Quartile,Categories,Year", '"Legacy Journal",5555-5555,Q2,"Legacy Cat",2020'].join("\n");
const fileLegacy = path.join(workdir, "legacy.csv");
fs.writeFileSync(fileLegacy, legacy, "utf8");
runBuilder([fileLegacy, "--out", legacyOut, "--fresh"]);
const regLegacy = JSON.parse(fs.readFileSync(legacyOut, "utf8"));
check("legacy format imports with flat + history fields", regLegacy.quartiles["55555555"]?.quartile === "Q2" && regLegacy.quartiles["55555555"]?.years?.["2020"]?.quartile === "Q2");

fs.rmSync(workdir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
