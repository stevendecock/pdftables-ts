# PdfTableExtractor
`PdfTableExtractor` extracts table structures from PDFs and returns either a grid (`ParsedTable[]`)
or convenient header-keyed objects (`TableObjects[]`).

## API
- `extractTables(buffer, options?) => Promise<ParsedTable[]>`
  - Returns rows/cells with bounding boxes for each detected table.
- `extractTablesAsObjects(buffer, options?) => Promise<TableObjects[]>`
  - Uses the first row as headers and maps subsequent rows into plain objects.

## How the extraction works (conceptual)
The core algorithm in `src/index.ts` orchestrates per-page table detection and then normalizes/merges
the results for consumer-friendly output.

### 1) Page-level table detection
For each page, the extractor loads text items (text runs with bounding boxes) and asks the table detector for a grid:

1. **Header-guided path (optional).** If `columnHeaders` are provided, it first tries to locate those header text items,
   builds column bands from their bounding boxes, and then assigns body text items into those columns top-down.
   This path can early-stop when a large vertical gap (`endOfTableWhitespace`) is detected.
2. **Automatic grid inference.** If header-guided detection fails or headers are not provided:
   - **Infer rows:** cluster text item Y centers into row bands using `yTolerance`.
   - **Infer columns:** cluster text item X centers, then run a light 1D k-means and model selection across
     `minColumnCount..maxColumnCount` to pick the best column count and centers.
   - **Assign text items:** each text item is placed into the nearest row/column center; text is concatenated
     left-to-right within each cell.
   - **Filter columns:** keep columns that are frequently used across rows (or a fallback "template row" heuristic).
   - **Trim and validate headers:** drop leading empty rows, then keep only columns that have header text
     (with a first-column exception for "index-like" data).
   - **Build table:** preserve empty cells, compute cell and table bounding boxes, and return `ParsedTable`.

### 2) Cross-page normalization and merge
`extractTables` merges consecutive page tables when they look like a continuation:
- Tables are merge-compatible when they have the same column count.
- If both tables have identical first-row headers, the repeated header row is dropped from the later page.
- Row indices are re-normalized as rows are appended.

### 3) Mapping to objects (optional)
`extractTablesAsObjects` turns `ParsedTable` into header-keyed rows:
- **Header detection:** multiple header rows are allowed; it scans from the top until a row looks "data-like"
  (numeric/date-heavy), then merges header rows per column.
- **Header keys:** empty headers become `columnN`, and duplicates get suffixes (`Header`, `Header_2`, ...).
- **Numeric inference:** a column is numeric if all non-empty cells parse as numbers; values are parsed using
  `decimalSeparator`. Non-numeric columns stay as strings.

## TableExtractionOptions
- `xTolerance` (default `3`): tolerance in PDF units when grouping text items into columns.
- `yTolerance` (default `3`): tolerance in PDF units when grouping text items into rows.
- `decimalSeparator` (default `"."`): decimal separator to use when parsing numeric columns in `extractTablesAsObjects`.
- `columnHeaders` (optional `string[]`): when provided, the detector first tries to locate these headers
  (newlines inside labels are treated as spaces) and anchor columns to them, falling back to auto-detection if they
  cannot be matched.
- `endOfTableWhitespace` (optional `number`, default `Infinity`): when guiding by headers, stop parsing if a vertical gap
  larger than this is found below the last parsed row.
- `minColumnCount` (default `2`): lower bound when inferring column count.
- `maxColumnCount` (default `15`): upper bound when inferring column count.
