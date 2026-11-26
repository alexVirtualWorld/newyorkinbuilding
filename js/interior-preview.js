import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { planFloor } from './building-floor-plan.js';
import { createInteriorGroup, buildInteriorGeometryData } from './building-interior-geometry.js';

const host = document.getElementById('view');
const stats = document.getElementById('stats');
const error = document.getElementById('error');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.Fog(0x101820, 85, 180);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 500);
camera.position.set(52, 43, 58);
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 13, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;

scene.add(new THREE.HemisphereLight(0xdceaff, 0x28313a, 2.0));
const sun = new THREE.DirectionalLight(0xffe0b4, 3.2);
sun.position.set(-35, 65, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(sun.target);

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xb9b4a9, roughness: 0.92 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x5f6972, roughness: 0.94, side: THREE.DoubleSide }),
  stair: new THREE.MeshStandardMaterial({ color: 0x858b8e, roughness: 0.84 }),
  elevator: new THREE.MeshStandardMaterial({ color: 0x343d47, roughness: 0.5, metalness: 0.28 })
};

function makeBuilding() {
  const outer = [
    { x: -18, z: -15 }, { x: 18, z: -15 },
    { x: 18, z: 15 }, { x: -18, z: 15 }
  ];
  return {
    cx: 0, cz: 0, height: 31.2, year: 2015,
    minX: -18, maxX: 18, minZ: -15, maxZ: 15,
    polygons: [{ outer, holes: [] }]
  };
}

async function main() {
  const building = makeBuilding();
  const facade = { floorHeight: 3.9, floorCount: 8, windowWidth: 2.7, materialSeed: 63.5 };
  const tower = new THREE.Group();
  tower.name = 'EightStoreyInteriorPreview';
  const aggregate = { rooms: 0, corridorSegments: 0, stairTreads: 0, elevatorShaftWalls: 0 };
  for (let floor = 0; floor < facade.floorCount; floor++) {
    const plan = planFloor(building, 0, facade, floor);
    const data = buildInteriorGeometryData(plan);
    const level = createInteriorGroup(THREE, data, materials);
    level.name = 'Floor-' + floor;
    tower.add(level);
    for (const key of Object.keys(aggregate)) aggregate[key] += data.counts[key] || 0;
  }
  scene.add(tower);
  window.__interiorPreview = { tower, floorCount: facade.floorCount, aggregate, renderer };
  const ground = new THREE.GridHelper(100, 50, 0x52616e, 0x293640);
  ground.position.y = -0.12;
  scene.add(ground);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(36, facade.floorHeight * facade.floorCount, 30)),
    new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.16 })
  );
  outline.position.y = facade.floorHeight * facade.floorCount / 2;
  scene.add(outline);
  stats.textContent = [
    '8 floors · 36 × 30 m footprint',
    aggregate.rooms + ' rooms · ' + aggregate.corridorSegments + ' corridor segments',
    aggregate.stairTreads + ' stair treads · ' + aggregate.elevatorShaftWalls + ' elevator shaft walls',
    'All levels generated from the same surveyed footprint'
  ].join('  |  ');
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
