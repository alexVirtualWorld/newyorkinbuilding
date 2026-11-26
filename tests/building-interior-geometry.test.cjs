const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const random = loadModule(readFileSync(join(__dirname, '../js/random.js'), 'utf8'));
const collision = loadModule(readFileSync(join(__dirname, '../js/building-collision.js'), 'utf8'));
const layout = loadModule(readFileSync(join(__dirname, '../js/building-layout.js'), 'utf8'), {
  imports: { './random.js': random }
});
const planner = loadModule(readFileSync(join(__dirname, '../js/building-floor-plan.js'), 'utf8'), {
  imports: {
    './building-collision.js': collision,
    './building-layout.js': layout
  }
});
const geometry = loadModule(readFileSync(join(__dirname, '../js/building-interior-geometry.js'), 'utf8'));

const facade = { floorHeight: 3.9, floorCount: 8, windowWidth: 2.7, materialSeed: 63.5 };
const building = {
  cx: 0, cz: 0, height: 31.2, year: 2015,
  polygons: [{
    outer: [
      { x: -18, z: -15 }, { x: 18, z: -15 },
      { x: 18, z: 15 }, { x: -18, z: 15 }
    ],
    holes: []
  }]
};

function makeData(floor = 0) {
  return geometry.buildInteriorGeometryData(planner.planFloor(building, 0, facade, floor));
}

function assertFiniteBoxes(items) {
  for (const item of items) {
    for (const key of ['x', 'y', 'z', 'width', 'height', 'depth', 'rotationY']) {
      assert.ok(Number.isFinite(item[key]), `${item.id}.${key} must be finite`);
    }
    assert.ok(item.width > 0 && item.height > 0 && item.depth > 0, item.id + ' must have positive dimensions');
  }
}

test('one floor creates a footprint surface, room partitions and door openings', () => {
  const data = makeData(0);
  assert.equal(data.floorY, 0);
  assert.ok(data.walls.some(wall => wall.kind === 'room-wall'));
  assert.ok(data.walls.some(wall => wall.kind === 'door-lintel'));
  assert.ok(data.walls.some(wall => wall.kind === 'core-wall'));
  assert.ok(data.corridorFloors.length > 0);
  assert.ok(data.counts.rooms > 0);
  assertFiniteBoxes(data.walls);
  assertFiniteBoxes(data.corridorFloors);
});

test('upper floors are vertically stacked at exact facade floor height', () => {
  const ground = makeData(0);
  const upper = makeData(5);
  assert.equal(ground.floorY, 0);
  assert.equal(upper.floorY, 5 * facade.floorHeight);
  assert.ok(upper.walls.every(wall => wall.y >= upper.floorY));
  assert.ok(upper.corridorFloors.every(floor => floor.y >= upper.floorY));
});

test('stairs rise through the storey and elevator shafts have stable per-floor walls', () => {
  const data = makeData(2);
  assert.equal(data.stairMeshes.filter(item => item.kind === 'stair-tread').length, 20);
  assert.equal(data.stairMeshes.filter(item => item.kind === 'stair-landing').length, 2);
  assert.equal(data.elevatorMeshes.filter(item => item.kind === 'elevator-shaft-wall').length, 3);
  assert.equal(data.elevatorMeshes.filter(item => item.kind === 'elevator-door').length, 1);
  const treads = data.stairMeshes.filter(item => item.kind === 'stair-tread');
  assert.ok(Math.max(...treads.map(item => item.y)) > Math.min(...treads.map(item => item.y)));
  assert.ok(treads.at(-1).height > treads[0].height, 'stair blocks should rise as solid stepped volumes');
  assert.ok(data.elevatorMeshes.some(item => item.kind === 'door-lintel'), 'elevator shaft entrance must have a real opening');
  assertFiniteBoxes(data.stairMeshes);
  assertFiniteBoxes(data.elevatorMeshes);
});

test('geometry generation is deterministic and does not mutate the floor plan', () => {
  const plan = planner.planFloor(building, 0, facade, 3);
  const before = JSON.stringify(plan);
  const a = geometry.buildInteriorGeometryData(plan);
  const b = geometry.buildInteriorGeometryData(plan);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(plan), before);
});

test('invalid floor-plan input fails explicitly', () => {
  assert.throws(() => geometry.buildInteriorGeometryData(null), /floor plan/);
  assert.throws(() => geometry.buildInteriorGeometryData({ rooms: [], corridors: [] }), /floor plan/);
});

test('preview page uses the same planner and geometry builder without changing city startup', () => {
  const preview = readFileSync(join(__dirname, '../js/interior-preview.js'), 'utf8');
  const html = readFileSync(join(__dirname, '../interior-preview.html'), 'utf8');
  const main = readFileSync(join(__dirname, '../js/main.js'), 'utf8');
  assert.ok(preview.includes("from './building-floor-plan.js'"));
  assert.ok(preview.includes("from './building-interior-geometry.js'"));
  assert.ok(preview.includes('buildInteriorGeometryData(plan)'));
  assert.ok(preview.includes('window.__interiorPreview = { tower, floorCount: facade.floorCount, aggregate, renderer }'));
  assert.ok(html.includes('./js/interior-preview.js'));
  assert.doesNotMatch(main, /building-interior-geometry/);
});
