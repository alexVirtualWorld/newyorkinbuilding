const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { Script } = require('node:vm');
const { loadModule } = require('./helpers/module.cjs');

const random = loadModule(readFileSync(join(__dirname, '../js/random.js'), 'utf8'));
const collision = loadModule(readFileSync(join(__dirname, '../js/building-collision.js'), 'utf8'));
const facadeModule = loadModule(readFileSync(join(__dirname, '../js/building-facade-style.js'), 'utf8'), {
  imports: { './random.js': random }
});
const layout = loadModule(readFileSync(join(__dirname, '../js/building-layout.js'), 'utf8'), {
  imports: { './random.js': random }
});
const floorPlanner = loadModule(readFileSync(join(__dirname, '../js/building-floor-plan.js'), 'utf8'), {
  imports: {
    './building-collision.js': collision,
    './building-layout.js': layout
  }
});

const facade = {
  floorHeight: 3.9, floorCount: 24, windowWidth: 2.7, materialSeed: 63.5
};
const rectangle = (x0, z0, x1, z1) => ({
  outer: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }],
  holes: []
});
const makeBuilding = polygon => ({
  cx: 0, cz: 0, height: 93.6, year: 2010,
  minX: Math.min(...polygon.outer.map(p => p.x)),
  maxX: Math.max(...polygon.outer.map(p => p.x)),
  minZ: Math.min(...polygon.outer.map(p => p.z)),
  maxZ: Math.max(...polygon.outer.map(p => p.z)),
  polygons: [polygon]
});

function insideEveryFootprintPoint(plan) {
  for (const room of plan.rooms) {
    for (const point of room.corners) {
      assert.equal(collision.polygonContains(plan.footprint, point.x, point.z), true,
        `room corner must remain inside the surveyed footprint: ${room.id}`);
    }
  }
  for (const corridor of plan.corridors) {
    for (const point of corridor.points) {
      assert.equal(collision.polygonContains(plan.footprint, point.x, point.z), true,
        `corridor route must remain inside the surveyed footprint: ${corridor.id}`);
    }
  }
}

test('a rectangular tower receives a central core, perimeter rooms and connected corridors', () => {
  const building = makeBuilding(rectangle(0, 0, 36, 30));
  const plan = floorPlanner.planFloor(building, 12, facade, 4);
  assert.ok(plan.core);
  assert.ok(plan.rooms.length >= 4, `expected perimeter rooms, got ${plan.rooms.length}`);
  assert.equal(plan.rooms.length, plan.corridors.length);
  assert.equal(plan.connectivity.connectedRoomCount, plan.rooms.length);
  assert.equal(plan.connectivity.totalRoomCount, plan.rooms.length);
  assert.equal(plan.connectivity.isConnected, true, JSON.stringify(plan.connectivity));
  assert.equal(plan.floorRole, 'standard');
  assert.equal(plan.core.elevatorCount, 2);
  assert.equal(plan.core.zones.filter(zone => zone.kind === 'stair').length, 2);
  assert.equal(plan.core.zones.filter(zone => zone.kind === 'elevator').length, 2);
  insideEveryFootprintPoint(plan);
});

test('floor role and room module remain deterministic for the same building and floor', () => {
  const building = makeBuilding(rectangle(-18, -15, 18, 15));
  const a = floorPlanner.planFloor(building, 99, facade, 0);
  const b = floorPlanner.planFloor(building, 99, facade, 0);
  assert.equal(a.floorRole, 'lobby');
  assert.deepEqual(a.rooms, b.rooms);
  assert.deepEqual(a.corridors, b.corridors);
  assert.equal(floorPlanner.planFloor(building, 99, facade, 23).floorRole, 'top');
  assert.throws(() => floorPlanner.planFloor(building, 99, facade, 24), /floorIndex/);
});

test('courtyard footprints keep rooms and corridor samples out of the void', () => {
  const polygon = {
    outer: rectangle(0, 0, 42, 38).outer,
    holes: [rectangle(15, 13, 27, 25).outer.slice().reverse()]
  };
  const plan = floorPlanner.planFloor(makeBuilding(polygon), 21, facade, 8);
  assert.ok(plan.core);
  insideEveryFootprintPoint(plan);
  for (const room of plan.rooms) {
    assert.equal(collision.polygonContains(plan.footprint, room.center.x, room.center.z), true);
  }
});

test('concave L-shaped and narrow footprints fail safely or produce valid plans', () => {
  const lShape = {
    outer: [
      { x: 0, z: 0 }, { x: 34, z: 0 }, { x: 34, z: 12 },
      { x: 14, z: 12 }, { x: 14, z: 32 }, { x: 0, z: 32 }
    ],
    holes: []
  };
  const plan = floorPlanner.planFloor(makeBuilding(lShape), 31, facade, 3);
  if (plan.core) insideEveryFootprintPoint(plan);
  else assert.ok(plan.warnings.length > 0);

  const narrow = makeBuilding(rectangle(0, 0, 7, 38));
  const narrowPlan = floorPlanner.planFloor(narrow, 32, facade, 3);
  assert.equal(narrowPlan.core, null);
  assert.equal(narrowPlan.rooms.length, 0);
  assert.ok(narrowPlan.warnings.length > 0);
});

test('disconnected surveyed polygons are planned independently', () => {
  const building = makeBuilding(rectangle(0, 0, 40, 32));
  building.polygons.push(rectangle(48, 0, 62, 16));
  const a = floorPlanner.planFloor(building, 41, facade, 2, { polygonIndex: 0 });
  const b = floorPlanner.planFloor(building, 41, facade, 2, { polygonIndex: 1 });
  assert.notEqual(a.footprintId, b.footprintId);
  assert.ok(a.core);
  assert.ok(b.core);
  insideEveryFootprintPoint(a);
  insideEveryFootprintPoint(b);
});

test('sampled surveyed footprints never produce invalid room geometry or non-finite routes', async () => {
  const compressed = readFileSync(join(__dirname, '../js/building-geodata.bin.gz'));
  const source = readFileSync(join(__dirname, '../js/building-geodata.js'), 'utf8')
    .replace('import.meta.url', JSON.stringify('https://example.test/city/js/building-geodata.js'))
    .replace('export const REAL_BUILDINGS', 'const REAL_BUILDINGS');
  const script = new Script(`(async () => { ${source}\nreturn REAL_BUILDINGS; })()`);
  const buildings = await script.runInNewContext({
    URL, Response, DecompressionStream,
    fetch: async url => new Response(compressed, { status: 200 })
  });
  let checked = 0, withRooms = 0;
  for (let index = 0; index < buildings.length && checked < 120; index += 19) {
    const building = buildings[index];
    const width = building.maxX - building.minX, depth = building.maxZ - building.minZ;
    if (width < 14 || depth < 14 || width > 100 || depth > 100 || building.height < 12) continue;
    const style = facadeModule.facadeStyleFor(building);
    if (style.floorCount < 2) continue;
    const plan = floorPlanner.planFloor(building, index, style, Math.min(2, style.floorCount - 1));
    assert.ok(plan.rooms.every(room => room.corners.every(p => Number.isFinite(p.x + p.z))));
    assert.ok(plan.corridors.every(path => path.points.every(p => Number.isFinite(p.x + p.z))));
    if (plan.core) insideEveryFootprintPoint(plan);
    if (plan.rooms.length) withRooms++;
    checked++;
  }
  assert.ok(checked >= 30, `only checked ${checked} suitable real footprints`);
  assert.ok(withRooms > 0, 'real survey sample should include at least one floor with rooms');
});
