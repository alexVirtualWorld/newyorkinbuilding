import { mulberry32 } from './random.js';

export const BUILDING_DATASET_HASH = '796136eb448bce005604b88062ab95c21a4cefeb34b53eba2ad47e3ab41b5853';
export const BUILDING_LAYOUT_SCHEMA_VERSION = 1;
export const MIN_INTERIOR_CLEAR_WIDTH = 6;

// Stable IDs are based on the immutable source-array index, not rounded centroids.
export function buildingIdFor(sourceIndex, datasetHash = BUILDING_DATASET_HASH) {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) throw new RangeError('sourceIndex must be a non-negative integer.');
  if (typeof datasetHash !== 'string' || !/^[a-f0-9]{64}$/i.test(datasetHash)) throw new TypeError('datasetHash must be a SHA-256 hex string.');
  return `nyc:${datasetHash.slice(0, 16)}:${sourceIndex}`;
}

export function floorCountFor(height, floorHeight) {
  if (!Number.isFinite(height) || height < 0 || !Number.isFinite(floorHeight) || floorHeight <= 0) {
    throw new RangeError('height must be non-negative and floorHeight must be positive.');
  }
  return Math.max(0, Math.floor((height + 0.22) / floorHeight));
}

// Mirrors evaluateApartmentInterior() in tsl-materials.js exactly.
export function facadeRoomModuleForFloor(floorIndex, materialSeed) {
  if (!Number.isInteger(floorIndex) || floorIndex < 0 || !Number.isFinite(materialSeed)) {
    throw new RangeError('A non-negative floor index and finite material seed are required.');
  }
  const fract = value => value - Math.floor(value);
  const baysHash = fract(Math.sin(floorIndex * 41.3 + materialSeed) * 43758.5453);
  const phaseHash = fract(Math.sin(floorIndex * 73.7 + materialSeed * 1.7) * 43758.5453);
  const bayCount = baysHash >= 0.5 ? 3 : 2;
  return Object.freeze({ bayCount, phase: Math.floor(phaseHash * bayCount) });
}

// Renderer-independent building descriptor. Standard floors are represented by a reusable range,
// never expanded into per-floor meshes at city startup.
export function createBuildingLayoutDescriptor(building, sourceIndex, facade, polygonIndex = 0) {
  if (!building || !Array.isArray(building.polygons) || !building.polygons[polygonIndex]) {
    throw new TypeError('A building with the requested footprint polygon is required.');
  }
  if (!facade || !Number.isFinite(facade.floorHeight) || !Number.isInteger(facade.floorCount)
    || !Number.isFinite(facade.windowWidth) || !Number.isFinite(facade.materialSeed)) {
    throw new TypeError('A facadeStyleFor result is required.');
  }
  const polygon = building.polygons[polygonIndex];
  const id = buildingIdFor(sourceIndex);
  return Object.freeze({
    schemaVersion: BUILDING_LAYOUT_SCHEMA_VERSION,
    id,
    footprintId: `${id}:p${polygonIndex}`,
    sourceIndex,
    polygonIndex,
    height: building.height,
    floorHeight: facade.floorHeight,
    floorCount: facade.floorCount,
    windowWidth: facade.windowWidth,
    materialSeed: facade.materialSeed,
    footprint: Object.freeze({ outer: polygon.outer, holes: polygon.holes || [] }),
    verticalProgram: Object.freeze({
      lobbyFloor: 0,
      standardFloorRange: facade.floorCount > 2 ? Object.freeze([1, facade.floorCount - 2]) : null,
      topFloor: facade.floorCount > 1 ? facade.floorCount - 1 : 0,
      stairwells: 2,
      elevatorBanks: facade.floorCount >= 12 ? 2 : 1
    })
  });
}

// Separate deterministic stream for interior variation; does not consume facade/detail RNG.
export function layoutRandomFor(sourceIndex, polygonIndex = 0) {
  const seed = Math.imul(sourceIndex + 1, 0x9e3779b1) ^ Math.imul(polygonIndex + 1, 0x85ebca6b);
  return mulberry32(seed >>> 0);
}
