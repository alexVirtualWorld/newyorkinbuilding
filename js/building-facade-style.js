import { mulberry32 } from './random.js';

// Shared facade parameters: both exterior materials and interior planning read these records.
export const FACADE_STYLES = Object.freeze([
  Object.freeze({ kind: 'masonry', options: Object.freeze({ stoneColor: 0xd8cdb8, trimColor: 0x9e937f, windowGlassColor: 0x1a2836, windowWidth: 2.6, floorHeight: 3.7, litProbability: 0.54, warmth: 0.80, seed: 12.4 }) }),
  Object.freeze({ kind: 'masonry', options: Object.freeze({ stoneColor: 0xa45a45, trimColor: 0xcab9a0, windowGlassColor: 0x16222e, windowWidth: 2.4, floorHeight: 3.5, litProbability: 0.56, warmth: 0.86, seed: 27.8 }) }),
  Object.freeze({ kind: 'curtain-wall', options: Object.freeze({ glassTint: 0x1a3a52, frameTint: 0x3b4c5b, windowWidth: 2.7, floorHeight: 3.9, litProbability: 0.60, warmth: 0.52, reflectivity: 0.92, seed: 63.5 }) }),
  Object.freeze({ kind: 'curtain-wall', options: Object.freeze({ glassTint: 0x242220, frameTint: 0x3c3631, windowWidth: 2.5, floorHeight: 3.8, litProbability: 0.64, warmth: 0.72, reflectivity: 0.88, seed: 81.9 }) }),
  Object.freeze({ kind: 'curtain-wall', options: Object.freeze({ glassTint: 0x264664, frameTint: 0xb0bcc8, windowWidth: 2.9, floorHeight: 4.1, litProbability: 0.58, warmth: 0.48, reflectivity: 0.95, seed: 94.3 }) })
]);

// Preserves the original coordinate-seeded facade distribution and storefront placement.
export function facadeStyleFor(building) {
  if (!building || !Number.isFinite(building.cx) || !Number.isFinite(building.cz)
    || !Number.isFinite(building.height) || building.height < 0) {
    throw new TypeError('facadeStyleFor requires a valid surveyed building.');
  }
  const seed = Math.round(building.cx * 31 + building.cz * 17);
  const tone = mulberry32(seed)();
  const index = building.year && building.year < 1945 ? (tone < 0.8 ? 0 : 1)
    : building.year && building.year < 1980 ? (tone < 0.55 ? 0 : 3)
      : tone < 0.6 ? 2 : 4;
  const style = FACADE_STYLES[index];
  return Object.freeze({
    index, seed, tone,
    windowWidth: style.options.windowWidth,
    floorHeight: style.options.floorHeight,
    floorCount: Math.max(0, Math.floor((building.height + 0.22) / style.options.floorHeight)),
    storefronts: building.height >= 6 && mulberry32(seed ^ 0x53544f52)() < 0.55,
    materialKind: style.kind,
    materialSeed: style.options.seed
  });
}
