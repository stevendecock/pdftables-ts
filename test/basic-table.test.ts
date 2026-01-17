import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { PdfTableExtractor } from "../src/index.js";

const extractor = new PdfTableExtractor();
const pdfPath_aardgas = "test-data/Elegant-Indexes-aardgas.pdf";
const pdfPath_elektriciteit = "test-data/Elegant-Indexes-elektriciteit.pdf";
const pdfPath_electricity_quotations = "test-data/ElectricityQuotations-NL.pdf";
const decimalSeparator = ",";

const expectedGrid_Aardgas = [
  ["PERIODE", "ZTP", "TTF20D101", "TTF101", "TTFDAMRLP"],
  ["2022-01", "83,29", "", "116,82", "83,42"],
  ["2022-02", "80,06", "", "85,21", "79,72"],
  ["2022-03", "129,03", "72,56", "81,03", "129,65"],
  ["2022-04", "94,30", "96,30", "131,52", "105,76"],
  ["2022-05", "80,37", "94,23", "101,96", "89,46"],
  ["2022-06", "96,77", "87,90", "94,09", "103,87"],
  ["2022-07", "130,60", "120,63", "106,56", "167,32"],
  ["2022-08", "177,77", "155,04", "171,02", "236,93"],
  ["2022-09", "129,80", "276,75", "235,78", "186,12"],
  ["2022-10", "51,17", "194,26", "204,20", "68,20"],
  ["2022-11", "82,76", "127,15", "136,09", "93,57"],
  ["2022-12", "112,12", "116,13", "118,26", "114,55"],
  ["2023-01", "62,01", "105,69", "118,16", "62,79"],
  ["2023-02", "53,39", "66,90", "64,23", "53,77"],
  ["2023-03", "44,40", "49,87", "52,96", "45,13"],
  ["2023-04", "41,82", "39,33", "43,85", "43,23"],
  ["2023-05", "30,36", "40,57", "42,27", "32,18"],
  ["2023-06", "31,34", "29,71", "31,95", "31,05"],
  ["2023-07", "29,48", "38,71", "32,37", "29,47"],
  ["2023-08", "33,00", "28,02", "29,51", "33,16"],
  ["2023-09", "36,04", "40,78", "35,00", "37,02"],
  ["2023-10", "42,59", "37,28", "36,63", "44,34"],
  ["2023-11", "43,13", "51,11", "47,02", "43,47"],
  ["2023-12", "35,55", "45,82", "45,92", "35,17"],
  ["2024-01", "30,09", "33,52", "36,27", "29,92"],
  ["2024-02", "25,83", "27,26", "29,89", "25,88"],
  ["2024-03", "26,53", "24,17", "25,81", "26,52"],
  ["2024-04", "28,93", "27,74", "26,83", "28,77"],
  ["2024-05", "31,33", "29,31", "28,95", "28,99"],
  ["2024-06", "34,17", "31,77", "31,86", "34,17"],
  ["2024-07", "32,03", "34,46", "34,47", "32,15"],
  ["2024-08", "37,49", "31,84", "32,40", "37,61"],
  ["2024-09", "36,29", "37,96", "38,28", "36,28"],
  ["2024-10", "40,01", "34,44", "36,06", "40,33"],
  ["2024-11", "43,92", "40,02", "40,42", "44,27"],
  ["2024-12", "47,62", "46,80", "44,56", "44,80"],
  ["2025-01", "48,30", "44,13", "44,93", "48,37"],
  ["2025-02", "50,94", "47,85", "47,54", "51,13"],
  ["2025-03", "41,55", "47,49", "50,58", "41,76"],
  ["2025-04", "34,84", "42,86", "41,84", "35,61"],
  ["2025-05", "34,06", "34,24", "35,34", "34,68"],
  ["2025-06", "35,90", "36,98", "35,32", "36,22"],
  ["2025-07", "33,09", "40,93", "36,83", "33,24"],
  ["2025-08", "32,17", "33,16", "33,88", "32,21"],
  ["2025-09", "31,92", "31,91", "32,75", "32,00"],
  ["2025-10", "31,51", "31,84", "32,37", "31,97"],
  ["2025-11", "", "31,74", "31,96", ""],
];

const expectedObjects = (() => {
  const [headers, ...rows] = expectedGrid_Aardgas;
  const numericColumnIndexes = new Set<number>([1, 2, 3, 4]);

  return rows.map(row => {
    const obj: Record<string, string | number | undefined> = {};
    headers.forEach((header, idx) => {
      const value = row[idx] ?? "";
      if (numericColumnIndexes.has(idx)) {
        obj[header] = value === "" ? undefined : Number(value.replace(decimalSeparator, "."));
      } else {
        obj[header] = value;
      }
    });
    return obj;
  });
})();

function loadPdfArrayBuffer(pdfPath: string): ArrayBuffer {
  const buf = readFileSync(pdfPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("Elegant-Indexes-aardgas.pdf", () => {
  it("extracts the structured table grid", async () => {
    const tables = await extractor.extractTables(loadPdfArrayBuffer(pdfPath_aardgas), {
      xTolerance: 4,
      yTolerance: 4,
    });

    expect(tables).toHaveLength(1);
    const [table] = tables;

    expect(table.rows.length).toBe(expectedGrid_Aardgas.length);
    expect(table.rows[0]?.cells.length).toBe(expectedGrid_Aardgas[0].length);

    const grid = table.rows.map(row => row.cells.map(cell => cell.text.trim()));
    expect(grid).toEqual(expectedGrid_Aardgas);
  });

  it("maps rows to objects using headers as keys", async () => {
    const tables = await extractor.extractTablesAsObjects(loadPdfArrayBuffer(pdfPath_aardgas), {
      xTolerance: 4,
      yTolerance: 4,
      decimalSeparator,
    });

    expect(tables).toHaveLength(1);
    const [table] = tables;

    expect(table.headers).toEqual(expectedGrid_Aardgas[0]);
    expect(table.rows).toEqual(expectedObjects);
  });
});

describe("Elegant-Indexes-elektriciteit.pdf", () => {
  it("parses the electricity index table as objects", async () => {
    const tables = await extractor.extractTablesAsObjects(
      loadPdfArrayBuffer(pdfPath_elektriciteit),
      {
        xTolerance: 4,
        yTolerance: 4,
        decimalSeparator,
      }
    );

    expect(tables).toHaveLength(1);
    const [table] = tables;

    expect(table.headers.length).toBe(7);
    expect(table.rows).toHaveLength(47);

    expect(table.rows[0]?.ENDEX101).toBeCloseTo(295.7);
  });

  it("parses the electricity index table when guided by provided headers", async () => {
    const tables = await extractor.extractTablesAsObjects(
      loadPdfArrayBuffer(pdfPath_elektriciteit),
      {
        xTolerance: 4,
        yTolerance: 4,
        decimalSeparator,
        columnHeaders: [
          "PERIODE",
          "BELPEX",
          "BELPEX RLP\n/\nBELPEX S21",
          "ENDEX20D101",
          "ENDEX101",
          "EPEXDAMREK",
          "EPEXDAMRLP",
        ],
      }
    );

    expect(tables).toHaveLength(1);
    const [table] = tables;

    console.log("Guided headers:", table.headers);
    console.log("Guided rows count:", table.rows.length);
    console.log("Guided first 3 rows:", table.rows.slice(0, 3));
    console.log("Guided last row:", table.rows[table.rows.length - 1]);

    expect(table.headers).toEqual([
      "PERIODE",
      "BELPEX",
      "BELPEX RLP / BELPEX S21",
      "ENDEX20D101",
      "ENDEX101",
      "EPEXDAMREK",
      "EPEXDAMRLP",
    ]);

    expect(table.headers.length).toBe(7);
    expect(table.rows).toHaveLength(47);
  });
});

describe("ElectricityQuotations-NL.pdf", () => {
  it("parses the electricity quotations table when guided by provided headers", async () => {
    const tables = await extractor.extractTablesAsObjects(
      loadPdfArrayBuffer(pdfPath_electricity_quotations),
      {
        xTolerance: 4,
        yTolerance: 4,
        decimalSeparator,
        columnHeaders: [
          "Maand",
          "Endex\n101\n(€/MWh)",
          "Endex\n103\n(€/MWh)",
        ],
      }
    );

    expect(tables).toHaveLength(1);
    const [table] = tables;

    console.log("Guided headers:", table.headers);
    console.log("Guided rows count:", table.rows.length);
    console.log("Guided first 3 rows:", table.rows.slice(0, 3));
    console.log("Guided last row:", table.rows[table.rows.length - 1]);

    expect(table.headers).toEqual([
      "Maand",
      "Endex101(€/MWh)",
      "Endex103(€/MWh)",
    ]);

    expect(table.headers.length).toBe(3);
    expect(table.rows).toHaveLength(48);
  });
});
