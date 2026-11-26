exit_code=0
exit_code=0
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { Script } = require('node:vm');
const { loadModule } = require('./helpers/module.cjs');

const random = loadModule(readFileSync(join(__dirname, '../js/random.js'), 'utf8'));
const facade = loadModule(readFileSync(join(__dirname, '../js/building-facade-style.js'), 'utf8'), {
  imports: { './random.js': random }
});
const layout = loadModule(readFileSync(join(__dirname, '../js/building-layout.js'), 'utf8'), {
  imports: { './random.js': random }
});

test('facade selection preserves original material, tone, seed and storefront rules', () => {
  const samples = [
    { cx: -90.5, cz: 685.5, height: 378, year: 1930 },
    { cx: 510, cz: -45.75, height: 289, year: 1930 },
    { cx: -203.25, cz: 5253.25, height: 429, year: 2010 },
    { cx: 100, cz: 200, height: 22, year: 1970 },
    { cx: -300, cz: 900, height: 14, year: 0 }
  ];
  const oldRandom = seed => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  for (const b of samples) {
    const seed = Math.round(b.cx * 31 + b.cz * 17), tone = oldRandom(seed)();
    const index = b.year && b.year < 1945 ? (tone < 0.8 ? 0 : 1)
      : b.year && b.year < 1980 ? (tone < 0.55 ? 0 : 3) : tone < 0.6 ? 2 : 4;
    const actual = facade.facadeStyleFor(b);
    assert.equal(actual.index, index);
    assert.equal(actual.seed, seed);
    assert.equal(actual.tone, tone);
    assert.equal(actual.storefronts, b.height >= 6 && oldRandom(seed ^ 0x53544f52)() < 0.55);
    assert.equal(actual.floorHeight, facade.FACADE_STYLES[index].options.floorHeight);
    assert.equal(actual.windowWidth, facade.FACADE_STYLES[index].options.windowWidth);
    assert.equal(actual.floorCount, Math.floor((b.height + 0.22) / actual.floorHeight));
  }
});

test('stable IDs include the dataset snapshot and original array index', () => {
  assert.equal(layout.buildingIdFor(12), 'nyc:796136eb448bce00:12');
  assert.notEqual(layout.buildingIdFor(12), layout.buildingIdFor(13));
  assert.notEqual(layout.buildingIdFor(12), layout.buildingIdFor(12, 'a'.repeat(64)));
  assert.throws(() => layout.buildingIdFor(-1), /sourceIndex/);
  assert.throws(() => layout.buildingIdFor(1, 'stale'), /datasetHash/);
});

test('room modules reproduce the facade shader two-or-three-bay pattern', () => {
  for (const seed of [12.4, 27.8, 63.5, 81.9, 94.3]) {
    for (let floor = 0; floor < 80; floor++) {
      const actual = layout.facadeRoomModuleForFloor(floor, seed);
      const fract = value => value - Math.floor(value);
      const baysHash = fract(Math.sin(floor * 41.3 + seed) * 43758.5453);
      const phaseHash = fract(Math.sin(floor * 73.7 + seed * 1.7) * 43758.5453);
      const bays = baysHash >= 0.5 ? 3 : 2;
      assert.equal(actual.bayCount, bays);
      assert.equal(actual.phase, Math.floor(phaseHash * bays));
    }
  }
});

test('layout descriptors keep disconnected polygons as separate footprints', () => {
  const building = { height: 180, polygons: [
    { outer: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 }], holes: [] },
    { outer: [{ x: 40, z: 0 }, { x: 50, z: 0 }, { x: 50, z: 10 }, { x: 40, z: 10 }], holes: [] }
  ] };
  const style = { floorHeight: 3.9, floorCount: 46, windowWidth: 2.7, materialSeed: 63.5 };
  const a = layout.createBuildingLayoutDescriptor(building, 7, style, 0);
  const b = layout.createBuildingLayoutDescriptor(building, 7, style, 1);
  assert.equal(a.id, b.id);
  assert.notEqual(a.footprintId, b.footprintId);
  assert.equal(a.floorCount, 46);
  assert.equal(a.verticalProgram.standardFloorRange[0], 1);
  assert.equal(a.verticalProgram.standardFloorRange[1], 44);
  assert.equal(a.verticalProgram.stairwells, 2);
  assert.equal(a.verticalProgram.elevatorBanks, 2);
});

test('layout random streams are stable and polygon-local', () => {
  assert.equal(layout.layoutRandomFor(17, 0)(), layout.layoutRandomFor(17, 0)());
  assert.notEqual(layout.layoutRandomFor(17, 0)(), layout.layoutRandomFor(17, 1)());
});

test('1000+ sampled surveyed buildings produce deterministic IDs and facade-aligned floor counts', async () => {
  const compressed = readFileSync(join(__dirname, '../js/building-geodata.bin.gz'));
  const source = readFileSync(join(__dirname, '../js/building-geodata.js'), 'utf8')
    .replace('import.meta.url', JSON.stringify('https://example.test/city/js/building-geodata.js'))
    .replace('export const REAL_BUILDINGS', 'const REAL_BUILDINGS');
  const script = new Script(`(async () => { ${source}\nreturn REAL_BUILDINGS; })()`);
  const load = () => script.runInNewContext({
    URL, Response, DecompressionStream,
    fetch: async url => new Response(compressed, { status: 200 })
  });
  const buildings = await load();
  assert.equal(buildings.length, 37353);
  const ids = new Set();
  let sampled = 0;
  for (let index = 0; index < buildings.length; index += 37) {
    const b = buildings[index], a = facade.facadeStyleFor(b), again = facade.facadeStyleFor(b);
    const id = layout.buildingIdFor(index);
    assert.equal(a.index, again.index);
    assert.equal(a.floorCount, again.floorCount);
    assert.equal(id, layout.buildingIdFor(index));
    assert.ok(!ids.has(id), `duplicate ID at source index ${index}`);
    ids.add(id);
    assert.equal(a.floorCount, Math.floor((b.height + 0.22) / a.floorHeight));
    sampled++;
  }
  assert.ok(sampled >= 1000);
});

test('the city renderer consumes the shared facade style selector', () => {
  const buildingsSource = readFileSync(join(__dirname, '../js/buildings.js'), 'utf8');
  assert.ok(buildingsSource.includes("import { FACADE_STYLES, facadeStyleFor } from './building-facade-style.js';"));
  assert.ok(buildingsSource.includes('FACADE_STYLES.map(({ kind, options })'));
  assert.ok(buildingsSource.includes('const facade = facadeStyleFor(b);'));
  assert.doesNotMatch(buildingsSource, /const mat = b\\.year/);
});

test('invalid inputs fail explicitly', () => {
  assert.throws(() => facade.facadeStyleFor({ cx: 0, cz: 0, height: -1 }), /valid surveyed building/);
  assert.throws(() => layout.createBuildingLayoutDescriptor({ polygons: [] }, 0, {}, 0), /footprint polygon/);
});