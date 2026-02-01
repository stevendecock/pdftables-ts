import { readFileSync } from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import type { PageTextItems, TextItem, TextItemPointer } from "../src/index.js";
import { PdfTraverser } from "../src/index.js";

describe("PdfTraverser DSL", () => {
  test(
    "Navigates to the 'Vaste vergoeding' value in Engie_EASY_Vast.pdf",
    async () => {
      const pdfPath = path.resolve("test-data", "Engie_EASY_Vast.pdf");
      const buf = readFileSync(pdfPath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      const traverser = await PdfTraverser.fromPdfBuffer(arrayBuffer);
      const actualText = (await traverser.findFirst("Vaste\nvergoeding"))
        .nextBelow({ maxDistance: 50 }).text();

      expect(actualText).toBe("69,00 €/jaar");
    },
    20000
  );

  test(
    "Navigates to the expected 'Energiedelen, Administratieve kost' value in Engie_EASY_Vast.pdf",
    async () => {
      const pdfPath = path.resolve("test-data", "Engie_EASY_Vast.pdf");
      const buf = readFileSync(pdfPath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      const traverser = await PdfTraverser.fromPdfBuffer(arrayBuffer);
      const actualText = (await traverser.findFirst("Energiedelen"))
        .nextBelow({ filter: item => item.text.toLowerCase().includes("kost") })
        .nextRight({
          yTolerance: 1.5,
          filter: (_item, pointer) => _item.text.includes("€/jaar"),
        }).text();

      expect(actualText).toBe("121 €/jaar");
    },
    20000
  );
});
