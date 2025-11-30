import { readFileSync } from "fs";
import path from "path";
import { PdfTableExtractor } from "../src";  // <— this is fine in TS

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node dist/test/manual-run.js <path-to-pdf>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  console.log(`Reading PDF: ${resolvedPath}`);

  const buf = readFileSync(resolvedPath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const extractor = new PdfTableExtractor();
  const tables = await extractor.extractTables(arrayBuffer, {
    xTolerance: 4,
    yTolerance: 4,
  });

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
}

main().catch((err) => {
  console.error("Error while extracting tables:", err);
  process.exit(1);
});
