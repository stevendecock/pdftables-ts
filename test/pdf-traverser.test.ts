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
    "Navigates to the 'Vaste vergoeding' value in Engie_DIRECT_ONLINE_Variabel.pdf",
    async () => {
      const pdfPath = path.resolve("test-data", "Engie_DIRECT_ONLINE_Variabel.pdf");
      const buf = readFileSync(pdfPath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      const traverser = await PdfTraverser.fromPdfBuffer(arrayBuffer);
      const actualText = (await traverser.findFirst("Vaste\nvergoeding"))
        .nextBelow({ maxDistance: 50 }).text();

      expect(actualText).toBe("30,00 €/jaar");
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

  test(
    "Navigates to the first 'Formules' section in Engie_DIRECT_Variabel.pdf.",
    async () => {
      const pdfPath = path.resolve("test-data", "Engie_DIRECT_Variabel.pdf");
      const buf = readFileSync(pdfPath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      const traverser = await PdfTraverser.fromPdfBuffer(arrayBuffer);
      const firstFormulas = (await traverser.findNth(
          "- Enkelvoudig = ", 1, { match: "startsWith" }
        ))
        .text();

      expect(firstFormulas).toBe("- Enkelvoudig = -0,3000 + (0,0374 x EPEXDAM)\n" 
        + "- Tweevoudig piekuren = -0,3000 + (0,0374 x EPEXDAM)\n"
        + "- Tweevoudig daluren = -0,3000 + (0,0374 x EPEXDAM)\n"
        + "Het resultaat van deze formules is een bedrag uitgedrukt in c€/kWh.");
    },
    20000
  );

  test(
    "Navigates to the second 'Formules' section in Engie_DIRECT_Variabel.pdf.",
    async () => {
      const pdfPath = path.resolve("test-data", "Engie_DIRECT_Variabel.pdf");
      const buf = readFileSync(pdfPath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      const traverser = await PdfTraverser.fromPdfBuffer(arrayBuffer);
      const secondFormulas = (await traverser.findNth(
          "- Enkelvoudig = ", 2, { match: "startsWith" }
        ))
        .text();

      expect(secondFormulas).toBe("- Enkelvoudig = 2,4811 + (0,1193 x EPEXDAM)\n" 
        + "- Tweevoudig piekuren = 2,5111 + (0,1271 x EPEXDAM)\n"
        + "- Tweevoudig daluren = 2,4021 + (0,0983 x EPEXDAM)\n"
        + "- Uitsluitend nacht = 2,4021 + (0,0983 x EPEXDAM)\n"
        + "Het resultaat van deze formules is een bedrag uitgedrukt in c€/kWh.");
    },
    20000
  );

});
