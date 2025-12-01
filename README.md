# pdftables-ts

TypeScript library to extract table structures from PDFs using glyph coordinates, preserving empty cells and headers.

## Features
- Infers rows/columns automatically from PDF glyph positions (using `pdfjs-dist`)
- Returns structured tables with bounding boxes and cell text
- Convenience helper to map tables into header/value objects with numeric inference and fallback column names
- Works in Node environments without PDF workers

## Installation
```bash
npm install pdftables-ts
```
`pdfjs-dist` is included as a dependency.

## Quick start
```ts
import { readFileSync } from "fs";
import { PdfTableExtractor } from "pdftables-ts";

const buf = readFileSync("path/to/file.pdf");
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const extractor = new PdfTableExtractor();
const tables = await extractor.extractTables(arrayBuffer, {
  xTolerance: 4,
  yTolerance: 4,
  // Optional: anchor detection to explicit headers (newlines are collapsed to spaces).
  columnHeaders: [
    "PERIODE",
    "BELPEX",
    "BELPEX RLP\n/\nBELPEX S21",
    "ENDEX20D101",
    "ENDEX101",
    "EPEXDAMREK",
    "EPEXDAMRLP",
  ],
  // Optional: stop when a larger vertical gap is found below the last row (PDF units).
  endOfTableWhitespace: 12,
});

for (const table of tables) {
  console.log(`Page ${table.pageIndex} - rows: ${table.rows.length}`);
  console.log(table.rows.map(row => row.cells.map(c => c.text.trim())).join("\n"));
}
```

If you prefer ready-to-use objects keyed by column headers (empty headers become `column1`, `column2`, ... and numeric columns are parsed):
```ts
const tables = await extractor.extractTablesAsObjects(arrayBuffer, { decimalSeparator: "," });
console.log(tables[0]?.headers); // ['Header A', 'Header B', ...]
console.log(tables[0]?.rows[0]);  // { Header A: '...', Header B: 12.34 }
```

## API
- `extractTables(buffer, options?) => Promise<ParsedTable[]>`
  - Returns rows/cells with bounding boxes for each detected table.
- `extractTablesAsObjects(buffer, options?) => Promise<TableObjects[]>`
  - Uses the first row as headers and maps subsequent rows into plain objects.

`TableExtractionOptions`:
- `xTolerance` (default `3`): tolerance in PDF units when grouping glyphs into columns.
- `yTolerance` (default `3`): tolerance in PDF units when grouping glyphs into rows.
- `decimalSeparator` (default `"."`): decimal separator to use when parsing numeric columns in `extractTablesAsObjects`.
- `columnHeaders` (optional `string[]`): when provided, the detector first tries to locate these headers (newlines inside labels are treated as spaces) and anchor columns to them, falling back to auto-detection if they cannot be matched.
- `endOfTableWhitespace` (optional `number`, default `Infinity`): when guiding by headers, stop parsing if a vertical gap larger than this is found below the last parsed row.
- `minColumnCount` (default `2`): lower bound when inferring column count.
- `maxColumnCount` (default `15`): upper bound when inferring column count.

## Manual test runner
```bash
npm run build
node dist/test/manual-run.js path/to/file.pdf
```
This prints detected tables to stdout for quick inspection.

## Development
- Install deps: `npm install`
- Run tests: `npm test`
- Build typed output: `npm run build`
- Manual PDF check: `npm run run:pdf -- path/to/file.pdf`

## Publishing checklist
- Replace `your-username` in `package.json` repository/bugs/homepage URLs with your GitHub org/user (or set a scoped name you own).
- Commit all changes and push to a public GitHub repo.
- Bump the version (`npm version patch|minor|major`), then publish: `npm publish --access public`.
- Verify in a fresh project: `npm install pdftables-ts` and import it.

## License
MIT © Steven Decock
