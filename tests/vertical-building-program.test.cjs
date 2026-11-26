const assert = require('node:assert/strict');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const programModule = loadModule(readFileSync(join(__dirname, '../js/vertical-building-program.js'), 'utf8'));
const building = { height: 429, year: 2014 };
const towerFacade = { floorCount: 110, floorHeight: 3.9 };
const midriseFacade = { floorCount: 8, floorHeight: 3.7 };

test('landmark mixed-use tower receives distinct lobby, retail, mechanical, refuge, observation and roof zones', () => {
  const program = programModule.buildVerticalBuildingProgram(building, towerFacade, {
    profile: 'mixed-use-landmark'
  });
  assert.equal(program.profile, 'mixed-use-landmark');
  assert.equal(program.floors[0].role, 'lobby');
  assert.deepEqual(Array.from(program.floors.slice(1, 3), floor => floor.role), ['retail', 'retail']);
  assert.equal(program.floors[5].role, 'mechanical');
  assert.equal(program.floors[25].role, 'refuge');
  assert.deepEqual(Array.from(program.floors.slice(106, 109), floor => floor.role),
    ['observation', 'observation', 'observation']);
  assert.equal(program.floors[109].role, 'roof');
  assert.equal(program.counts.lobby, 1);
  assert.equal(program.counts.retail, 2);
  assert.equal(program.counts.observation, 3);
  assert.equal(program.counts.roof, 1);
  assert.equal(program.floors.length, 110);
});

test('office tower default is conservative and does not invent retail or observation use', () => {
  const program = programModule.buildVerticalBuildingProgram(building, towerFacade);
  assert.equal(program.profile, 'office-tower');
  assert.equal(program.floors[0].role, 'lobby');
  assert.equal(program.floors[1].role, 'standard');
  assert.equal(program.floors[5].role, 'mechanical');
  assert.ok(!program.floors.some(floor => floor.role === 'retail'));
  assert.ok(!program.floors.some(floor => floor.role === 'observation'));
  assert.equal(program.floors.at(-1).role, 'roof');
});

test('low-rise buildings receive no unsupported high-rise refuge or mechanical floors', () => {
  const program = programModule.buildVerticalBuildingProgram({ height: 29, year: 1930 }, midriseFacade);
  assert.equal(program.profile, 'low-rise');
  assert.equal(program.floors[0].role, 'lobby');
  assert.equal(program.floors.at(-1).role, 'roof');
  assert.ok(program.floors.every(floor => !['mechanical', 'refuge', 'observation'].includes(floor.role)));
});

test('vertical schedules are deterministic and reject unknown profiles', () => {
  const a = programModule.buildVerticalBuildingProgram(building, towerFacade, { profile: 'mixed-use-landmark' });
  const b = programModule.buildVerticalBuildingProgram(building, towerFacade, { profile: 'mixed-use-landmark' });
  assert.deepEqual(a, b);
  assert.throws(() => programModule.buildVerticalBuildingProgram(building, towerFacade, { profile: 'hotel' }),
    /Unknown vertical program profile/);
});

test('single-storey buildings retain a usable ground-floor lobby instead of replacing it with a roof', () => {
  const program = programModule.buildVerticalBuildingProgram({ height: 3.5, year: 2020 }, {
    floorCount: 1, floorHeight: 3.5
  });
  assert.equal(program.floors.length, 1);
  assert.equal(program.floors[0].role, 'lobby');
});
