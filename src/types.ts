export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Glyph {
  text: string;
  bbox: Rect;
}

export interface TableCell {
  rowIndex: number;
  columnIndex: number;
  text: string;
  bbox: Rect | null;       // null if completely empty
}

export interface TableRow {
  rowIndex: number;
  cells: TableCell[];
}

export interface ParsedTable {
  pageIndex: number;       // zero-based
  bbox: Rect;              // bounding box that covers the whole table
  rows: TableRow[];
}

export interface TableExtractionOptions {
  // Optional hint: expected number of columns
  expectedColumnCount?: number;
  // Tolerances in PDF units
  xTolerance?: number;     // default: 3–5
  yTolerance?: number;     // default: 3–5
}

export interface PdfTableExtractor {
  extractTables(buffer: ArrayBuffer, options?: TableExtractionOptions): Promise<ParsedTable[]>;
}
