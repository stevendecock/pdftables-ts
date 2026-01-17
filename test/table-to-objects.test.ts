import { describe, expect, it } from "vitest";
import { PdfTableExtractor, ParsedTable, TableExtractionOptions } from "../src/index.js";

class StubExtractor extends PdfTableExtractor {
  constructor(private readonly tables: ParsedTable[]) {
    super();
  }

  async extractTables(
    _buffer: ArrayBuffer,
    _options?: TableExtractionOptions
  ): Promise<ParsedTable[]> {
    return this.tables;
  }
}

const sampleTable: ParsedTable = {
  pageIndex: 0,
  bbox: { x: 0, y: 0, width: 0, height: 0 },
  rows: [
    {
      rowIndex: 0,
      cells: [
        { rowIndex: 0, columnIndex: 0, text: "", bbox: null },
        { rowIndex: 0, columnIndex: 1, text: "Name", bbox: null },
        { rowIndex: 0, columnIndex: 2, text: "Age", bbox: null },
      ],
    },
    {
      rowIndex: 1,
      cells: [
        { rowIndex: 1, columnIndex: 0, text: "1", bbox: null },
        { rowIndex: 1, columnIndex: 1, text: "John", bbox: null },
        { rowIndex: 1, columnIndex: 2, text: "5", bbox: null },
      ],
    },
    {
      rowIndex: 2,
      cells: [
        { rowIndex: 2, columnIndex: 0, text: "2", bbox: null },
        { rowIndex: 2, columnIndex: 1, text: "Mary", bbox: null },
        { rowIndex: 2, columnIndex: 2, text: "", bbox: null },
      ],
    },
  ],
};

describe("table to objects mapping", () => {
  it("assigns default column names and parses numeric columns", async () => {
    const extractor = new StubExtractor([sampleTable]);
    const [objects] = await extractor.extractTablesAsObjects(new ArrayBuffer(0));

    expect(objects.headers).toEqual(["column1", "Name", "Age"]);
    expect(objects.rows).toEqual([
      { column1: 1, Name: "John", Age: 5 },
      { column1: 2, Name: "Mary", Age: undefined },
    ]);
  });
});
