export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextItem {
  text: string;
  bbox: Rect;
}

export interface TableCell {
  rowIndex: number;
  columnIndex: number;
  text: string;
  bbox: Rect | null; // null if completely empty
}

export interface TableRow {
  rowIndex: number;
  cells: TableCell[];
}

export interface ParsedTable {
  pageIndex: number; // zero-based
  bbox: Rect; // bounding box that covers the whole table
  rows: TableRow[];
}

export interface TableExtractionOptions {
  // Tolerances in PDF units
  xTolerance?: number; // default: 3-5
  yTolerance?: number; // default: 3-5

  // Parsing preferences
  decimalSeparator?: string; // default: "."

  // Optional explicit column headers to guide detection.
  // Each string is matched to text item content (trimmed). Newlines split into multiple items that are combined.
  // When provided, the detector will attempt a header-guided extraction first before falling back.
  columnHeaders?: string[];

  // Optional vertical whitespace (in PDF units) that signals the table ended when a larger gap is found.
  endOfTableWhitespace?: number;

  // Optional hints - but *not* required
  minColumnCount?: number; // default: 2
  maxColumnCount?: number; // default: 15
}

export type TableCellValue = string | number | undefined;

export interface TableObjects {
  pageIndex: number;
  headers: string[];
  rows: Array<Record<string, TableCellValue>>;
}

export interface PdfTableExtractorApi {
  extractTables(buffer: ArrayBuffer, options?: TableExtractionOptions): Promise<ParsedTable[]>;
  extractTablesAsObjects(
    buffer: ArrayBuffer,
    options?: TableExtractionOptions
  ): Promise<TableObjects[]>;
}
