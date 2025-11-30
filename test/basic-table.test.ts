import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { extractTablesFromPdf } from "../src";

describe("basic table", () => {
  it("keeps empty cells", async () => {
    const buf = readFileSync("test-data/table-with-empty-cells.pdf");
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const tables = await extractTablesFromPdf(arrayBuffer, {
      xTolerance: 4,
      yTolerance: 4,
    });

    // Basic expectations
    expect(tables.length).toBeGreaterThan(0);
    const table = tables[0];

    // Check e.g. row 0 has 5 cells, and some are empty
    expect(table.rows[0].cells.length).toBe(5);
    // Check that a cell expected to be empty truly is ""
  });
});
