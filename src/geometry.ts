import type { Glyph } from "./types";

export function clusterPositions(positions: number[], tolerance: number): number[] {
  if (positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => a - b);
  const bands: number[] = [];
  let currentBandStart = sorted[0];
  let currentBandValues: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    if (Math.abs(v - currentBandStart) <= tolerance) {
      currentBandValues.push(v);
    } else {
      const center =
        currentBandValues.reduce((acc, n) => acc + n, 0) / currentBandValues.length;
      bands.push(center);

      currentBandStart = v;
      currentBandValues = [v];
    }
  }

  const center =
    currentBandValues.reduce((acc, n) => acc + n, 0) / currentBandValues.length;
  bands.push(center);

  return bands;
}

export function inferColumns(glyphs: Glyph[], xTolerance: number): number[] {
  const centers = glyphs.map(g => g.bbox.x + g.bbox.width / 2);
  return clusterPositions(centers, xTolerance);
}

export function inferRows(glyphs: Glyph[], yTolerance: number): number[] {
  const centers = glyphs.map(g => g.bbox.y + g.bbox.height / 2);
  const bands = clusterPositions(centers, yTolerance);
  return bands.sort((a, b) => b - a); // top row first
}
