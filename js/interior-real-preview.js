import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { REAL_BUILDINGS } from './building-geodata.js';
import { facadeStyleFor } from './building-facade-style.js';
import { planFloor } from './building-floor-plan.js';
import { buildVerticalBuildingProgram } from './vertical-building-program.js';
import {
  buildInteriorGeometryData,
  combineInteriorGeometryData,
  createInteriorGroup
} from './building-interior-geometry.js';

const host = document.getElementById('view');
const stats = document.getElementById('stats');
const error = document.getElementById('error');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.Fog(0x101820, 500, 1600);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 2500);
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 65;
controls.maxDistance = 1500;

scene.add(new THREE.HemisphereLight(0xdceaff, 0x28313a, 2.0));
const sun = new THREE.DirectionalLight(0xffe0b4, 3.0);
sun.position.set(-220, 520, 180);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(sun.target);

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xb9b4a9, roughness: 0.92 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x65717b, roughness: 0.94, side: THREE.DoubleSide }),
  stair: new THREE.MeshStandardMaterial({ color: 0x858b8e, roughness: 0.84 }),
  elevator: new THREE.MeshStandardMaterial({ color: 0x343d47, roughness: 0.5, metalness: 0.28 }),
  equipment: new THREE.MeshStandardMaterial({ color: 0x7e8b94, roughness: 0.72, metalness: 0.24 }),
  roomWalls: {
    lobby: new THREE.MeshStandardMaterial({ color: 0xc2aa8b, roughness: 0.88 }),
    retail: new THREE.MeshStandardMaterial({ color: 0xc9a46c, roughness: 0.86 }),
    standard: new THREE.MeshStandardMaterial({ color: 0xb9b4a9, roughness: 0.92 }),
    mechanical: new THREE.MeshStandardMaterial({ color: 0x71808c, roughness: 0.9 }),
    refuge: new THREE.MeshStandardMaterial({ color: 0x8ca5ad, roughness: 0.9 }),
    observation: new THREE.MeshStandardMaterial({ color: 0xa9bdc8, roughness: 0.84 }),
    top: new THREE.MeshStandardMaterial({ color: 0x98a7b2, roughness: 0.86 })
  },
  corridorFloors: {
    lobby: new THREE.MeshStandardMaterial({ color: 0x86745f, roughness: 0.92, side: THREE.DoubleSide }),
    retail: new THREE.MeshStandardMaterial({ color: 0x927650, roughness: 0.9, side: THREE.DoubleSide }),
    standard: new THREE.MeshStandardMaterial({ color: 0x65717b, roughness: 0.94, side: THREE.DoubleSide }),
    mechanical: new THREE.MeshStandardMaterial({ color: 0x3f515d, roughness: 0.94, side: THREE.DoubleSide }),
    refuge: new THREE.MeshStandardMaterial({ color: 0x506c78, roughness: 0.92, side: THREE.DoubleSide }),
    observation: new THREE.MeshStandardMaterial({ color: 0x647e8c, roughness: 0.88, side: THREE.DoubleSide })
  }
};

function findOneWorldTradeCenter() {
  return REAL_BUILDINGS.find(building => building.cx === -203.25 && building.cz === 5253.25);
}

async function main() {
  const building = findOneWorldTradeCenter();
  if (!building) throw new Error('The verified One World Trade Center footprint was not found in the NYC survey.');
  const facade = facadeStyleFor(building);
  const verticalProgram = buildVerticalBuildingProgram(building, facade, { profile: 'mixed-use-landmark' });
  const floorData = [];
  let connectedRooms = 0, candidateRooms = 0, floorsWithCore = 0;
  const roleStats = Object.fromEntries(Object.keys(verticalProgram.counts).map(role => [role, { floors: 0, rooms: 0 }]));
  for (let floor = 0; floor < facade.floorCount; floor++) {
    const program = verticalProgram.floors[floor];
    const plan = planFloor(building, 35221, facade, floor, { program });
    const data = buildInteriorGeometryData(plan);
    floorData.push(data);
    connectedRooms += plan.rooms.length;
    candidateRooms += plan.connectivity.candidateRoomCount ?? plan.rooms.length;
    roleStats[plan.floorRole].floors++;
    roleStats[plan.floorRole].rooms += plan.rooms.length;
    if (plan.core) floorsWithCore++;
  }
  const towerData = combineInteriorGeometryData(floorData);
  const tower = createInteriorGroup(THREE, towerData, materials);
  tower.name = 'OneWorldTradeCenterInterior';
  tower.position.set(-building.cx, 0, -building.cz);
  scene.add(tower);

  const centerY = building.height * 0.5;
  controls.target.set(0, centerY, 0);
  camera.position.set(420, centerY + 290, 470);
  camera.lookAt(0, centerY, 0);
  controls.update();

  const ground = new THREE.GridHelper(240, 80, 0x52616e, 0x293640);
  ground.position.y = -0.15;
  scene.add(ground);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(
      building.maxX - building.minX, building.height, building.maxZ - building.minZ
    )),
    new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.18 })
  );
  outline.position.set(0, centerY, 0);
  scene.add(outline);

  const aggregate = towerData.counts;
  stats.textContent = [
    Math.round(building.height) + ' m · ' + facade.floorCount + ' floors · surveyed footprint ' +
      (building.maxX - building.minX).toFixed(1) + ' × ' + (building.maxZ - building.minZ).toFixed(1) + ' m',
    connectedRooms + ' rooms / ' + candidateRooms + ' candidates · ' + aggregate.corridorSegments + ' corridor segments',
    aggregate.stairTreads + ' stair blocks · ' + aggregate.elevatorShaftWalls + ' shaft wall segments · ' +
      aggregate.roofEquipment + ' roof equipment units',
    floorsWithCore + '/' + facade.floorCount + ' floors have a valid core · one batched tower group',
    'Profile ' + verticalProgram.profile + ' · ' + Object.entries(verticalProgram.counts)
      .map(([role, count]) => role + ' ' + count + 'F').join(' · '),
    'Spaces by role: ' + Object.entries(roleStats).map(([role, data]) =>
      role + ' ' + data.rooms).join(' · ')
  ].join('  |  ');
  window.__interiorPreview = { tower, towerData, building, facade, renderer, floorData, roleStats, verticalProgram, camera, controls };
  await renderer.init();
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}
main().catch(err => {
  console.error(err);
  error.textContent = err?.stack || String(err);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
