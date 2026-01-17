import { readFileSync } from "fs";
import path from "path";
import { PdfTableExtractor } from "../src/index.js";  // <— this is fine in TS

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node dist/test/manual-run.js <path-to-pdf>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  console.log(`Reading PDF: ${resolvedPath}`);

  const buf = readFileSync(resolvedPath);
  // pdfjs detaches the ArrayBuffer during parsing, so create a fresh copy for each call.
  const makeArrayBuffer = () => Uint8Array.from(buf).buffer;

  const extractor = new PdfTableExtractor();
  const options = {
    xTolerance: 4,
    yTolerance: 4,
    columnHeaders: [
          "Maand",
          "Endex\n101\n(€/MWh)",
          "Endex\n103\n(€/MWh)",
        ],
  };

  const tables = await extractor.extractTables(makeArrayBuffer(), options);

  if (tables.length === 0) {
    console.log("No tables found (or no glyphs).");
    return;
  }

  for (const table of tables) {
    console.log(`\n=== Page ${table.pageIndex} ===`);
    console.log(`Rows: ${table.rows.length}, Cols: ${table.rows[0]?.cells.length ?? 0}`);

    for (const row of table.rows) {
      const line = row.cells
        .map((cell) => {
          const t = cell.text.trim();
          return t === "" ? "[ ]" : `[${t}]`;
        })
        .join(" | ");
      console.log(line);
    }
  }

  const objectTables = await extractor.extractTablesAsObjects(makeArrayBuffer(), {
    ...options,
    decimalSeparator: ",",
  });

  console.log("\n\n--- Structured objects ---");
  for (const table of objectTables) {
    console.log(`\n=== Page ${table.pageIndex} ===`);
    console.log("Headers:", table.headers);
    console.log("Rows:");
    console.dir(table.rows, { depth: null });
  }
}

main().catch((err) => {
  console.error("Error while extracting tables:", err);
  process.exit(1);
});
