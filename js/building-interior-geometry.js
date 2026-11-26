const DEFAULTS = Object.freeze({
  wallHeight: 2.85,
  wallThickness: 0.14,
  floorThickness: 0.18,
  doorWidth: 1.0,
  coreDoorWidth: 1.5,
  corridorHeight: 0.12,
  stairSteps: 10,
  stairWidth: 1.35,
  stairClearance: 0.12
});

function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function interpolate(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function boxBetween(a, b, y, height, thickness, kind, id) {
  const length = distance(a, b);
  if (length < 0.02) return null;
  const center = midpoint(a, b);
  return Object.freeze({
    id, kind,
    x: center.x, y: y + height * 0.5, z: center.z,
    width: length, height, depth: thickness,
    rotationY: -Math.atan2(b.z - a.z, b.x - a.x)
  });
}

function splitDoorWall(a, b, y, options, id) {
  const length = distance(a, b);
  const gap = Math.min(options.doorWidth, length * 0.42);
  const halfT = gap / (2 * length);
  const left = 0.5 - halfT, right = 0.5 + halfT;
  const doorHeight = Math.min(2.15, options.wallHeight - 0.25);
  const segments = [];
  const first = boxBetween(a, interpolate(a, b, left), y, options.wallHeight, options.wallThickness, 'room-wall', id + ':a');
  const second = boxBetween(interpolate(a, b, right), b, y, options.wallHeight, options.wallThickness, 'room-wall', id + ':b');
  if (first) segments.push(first);
  if (second) segments.push(second);
  const lintel = boxBetween(interpolate(a, b, left), interpolate(a, b, right),
    y + doorHeight, options.wallHeight - doorHeight, options.wallThickness, 'door-lintel', id + ':lintel');
  if (lintel) segments.push(lintel);
  return segments;
}

function roomWalls(room, y, options) {
  const corners = room.corners;
  const walls = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge], b = corners[(edge + 1) % 4];
    if (edge === 2) walls.push(...splitDoorWall(a, b, y, options, room.id + ':door-wall'));
    else {
      const wall = boxBetween(a, b, y, options.wallHeight, options.wallThickness, 'room-wall', room.id + ':wall-' + edge);
      if (wall) walls.push(wall);
    }
  }
  return walls;
}

function corridorSlabs(corridor, y, options) {
  const slabs = [];
  for (let i = 1; i < corridor.points.length; i++) {
    const a = corridor.points[i - 1], b = corridor.points[i];
    const length = distance(a, b);
    if (length < 0.05) continue;
    const center = midpoint(a, b);
    slabs.push(Object.freeze({
      id: corridor.id + ':' + (i - 1), kind: 'corridor-floor',
      x: center.x, y: y + options.corridorHeight * 0.5, z: center.z,
      width: length + corridor.width * 0.12,
      height: options.corridorHeight, depth: corridor.width,
      rotationY: -Math.atan2(b.z - a.z, b.x - a.x)
    }));
  }
  return slabs;
}

function rectCorners(rect) {
  const { center, width, depth } = rect;
  return [
    { x: center.x - width / 2, z: center.z - depth / 2 },
    { x: center.x + width / 2, z: center.z - depth / 2 },
    { x: center.x + width / 2, z: center.z + depth / 2 },
    { x: center.x - width / 2, z: center.z + depth / 2 }
  ];
}

function coreWalls(core, y, options, entranceSide = 0) {
  const corners = rectCorners(core);
  const walls = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge], b = corners[(edge + 1) % 4];
    if (edge === entranceSide) walls.push(...splitDoorWall(a, b, y, {
      ...options, doorWidth: options.coreDoorWidth
    }, 'core:entrance'));
    else {
      const wall = boxBetween(a, b, y, options.wallHeight, options.wallThickness * 1.4, 'core-wall', 'core:wall-' + edge);
      if (wall) walls.push(wall);
    }
  }
  return walls;
}

function stairTreads(zone, floorY, floorHeight, options) {
  const count = options.stairSteps;
  const stepDepth = Math.max(0.22, (zone.depth - options.stairClearance * 2) / count);
  const stepHeight = floorHeight / count;
  const treadWidth = Math.min(zone.width - 0.3, options.stairWidth);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(Object.freeze({
      id: zone.id + ':step-' + i, kind: 'stair-tread',
      x: zone.center.x,
      y: floorY + (stepHeight * (i + 1) - 0.06) * 0.5,
      z: zone.center.z - zone.depth / 2 + options.stairClearance + stepDepth * (i + 0.5),
      width: treadWidth, height: Math.max(0.12, stepHeight * (i + 1) - 0.06), depth: stepDepth * 1.08,
      rotationY: 0
    }));
  }
  result.push(Object.freeze({
    id: zone.id + ':landing', kind: 'stair-landing',
    x: zone.center.x, y: floorY + floorHeight - 0.08,
    z: zone.center.z + zone.depth / 2 - options.stairClearance * 0.5,
    width: treadWidth, height: 0.16, depth: options.stairClearance * 2,
    rotationY: 0
  }));
  return result;
}

function elevatorShaft(zone, y, floorHeight, options) {
  const corners = rectCorners(zone);
  const walls = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge], b = corners[(edge + 1) % 4];
    if (edge === 0) {
      walls.push(...splitDoorWall(a, b, y, {
        ...options, wallHeight: floorHeight, doorWidth: Math.min(1.0, zone.width * 0.8)
      }, zone.id + ':shaft-entrance'));
    } else {
      const wall = boxBetween(a, b, y,
        floorHeight, options.wallThickness * 0.8, 'elevator-shaft-wall', zone.id + ':shaft-' + edge);
      if (wall) walls.push(wall);
    }
  }
  const door = Object.freeze({
    id: zone.id + ':door', kind: 'elevator-door',
    x: zone.center.x, y: y + 1.05, z: zone.center.z - zone.depth / 2 - 0.025,
    width: Math.min(1.0, zone.width * 0.8), height: 2.1, depth: 0.05, rotationY: 0
  });
  return [...walls, door];
}

/**
 * Convert one renderer-independent floor plan into explicit, deterministic mesh descriptors.
 * This module deliberately does not attach anything to the city scene: interiors are opt-in.
 */
export function buildInteriorGeometryData(plan, overrides = {}) {
  if (!plan || !plan.footprint?.outer || !Array.isArray(plan.rooms) || !Array.isArray(plan.corridors)) {
    throw new TypeError('A valid floor plan is required.');
  }
  const options = { ...DEFAULTS, ...overrides };
  const floorY = plan.floorIndex * plan.floorHeight;
  const walls = [];
  const corridorFloors = [];
  const stairMeshes = [];
  const elevatorMeshes = [];

  for (const room of plan.rooms) walls.push(...roomWalls(room, floorY, options));
  for (const corridor of plan.corridors) corridorFloors.push(...corridorSlabs(corridor, floorY, options));

  if (plan.core) {
    let entranceSide = 0;
    const firstPath = plan.corridors[0]?.points;
    if (firstPath?.length > 1) {
      const target = firstPath[firstPath.length - 1];
      const dx = target.x - plan.core.center.x, dz = target.z - plan.core.center.z;
      const distances = [
        Math.abs(dz + plan.core.depth / 2),
        Math.abs(dx - plan.core.width / 2),
        Math.abs(dz - plan.core.depth / 2),
        Math.abs(dx + plan.core.width / 2)
      ];
      entranceSide = distances.indexOf(Math.min(...distances));
    }
    walls.push(...coreWalls(plan.core, floorY, options, entranceSide));
    for (const zone of plan.core.zones) {
      if (zone.kind === 'stair') stairMeshes.push(...stairTreads(zone, floorY, plan.floorHeight, options));
      if (zone.kind === 'elevator') elevatorMeshes.push(...elevatorShaft(zone, floorY, plan.floorHeight, options));
    }
  }

  const counts = Object.freeze({
    rooms: plan.rooms.length,
    roomWalls: walls.filter(item => item.kind === 'room-wall').length,
    doors: walls.filter(item => item.kind === 'door-lintel').length,
    corridorSegments: corridorFloors.length,
    stairTreads: stairMeshes.filter(item => item.kind === 'stair-tread').length,
    elevatorShaftWalls: elevatorMeshes.filter(item => item.kind === 'elevator-shaft-wall').length
  });

  return Object.freeze({
    id: plan.id + ':geometry',
    floorIndex: plan.floorIndex,
    floorY,
    floorHeight: plan.floorHeight,
    footprint: plan.footprint,
    walls: Object.freeze(walls),
    corridorFloors: Object.freeze(corridorFloors),
    stairMeshes: Object.freeze(stairMeshes),
    elevatorMeshes: Object.freeze(elevatorMeshes),
    counts
  });
}

/** Build Three.js meshes from the descriptors using caller-owned shared materials. */
export function createInteriorGroup(THREE, data, materials = {}) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.BoxGeometry || !data) {
    throw new TypeError('Three.js and interior geometry data are required.');
  }
  const group = new THREE.Group();
  group.name = data.id;
  const defaults = {
    wall: new THREE.MeshStandardMaterial({ color: 0xb7b1a5, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x777a7d, roughness: 0.92, side: THREE.DoubleSide }),
    stair: new THREE.MeshStandardMaterial({ color: 0x888b8d, roughness: 0.86 }),
    elevator: new THREE.MeshStandardMaterial({ color: 0x343b43, roughness: 0.55, metalness: 0.35 })
  };
  const material = { ...defaults, ...materials };
  const rings = [data.footprint.outer, ...(data.footprint.holes || [])].map((ring, index) => {
    const points = ring.map(point => new THREE.Vector2(point.x, point.z));
    if (points.length > 1 && points[0].distanceTo(points[points.length - 1]) < 1e-5) points.pop();
    if (THREE.ShapeUtils.isClockWise(points) !== (index === 0)) points.reverse();
    return points;
  });
  if (rings[0]?.length >= 3) {
    const triangles = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
    const points = rings.flat();
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    for (const point of points) positions.push(point.x, data.floorY, point.y);
    const indices = [];
    for (const [a, b, c] of triangles) indices.push(a, c, b);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const floor = new THREE.Mesh(geometry, material.floor);
    floor.name = 'FloorSurface';
    floor.receiveShadow = true;
    group.add(floor);
  }
  const addBoxes = (items, mat, name) => {
    if (!items.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
    mesh.name = name;
    const dummy = new THREE.Object3D();
    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.rotationY || 0, 0);
      dummy.scale.set(item.width, item.height, item.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.parts = items.map(item => ({ id: item.id, kind: item.kind }));
    group.add(mesh);
  };
  addBoxes(data.walls, material.wall, 'InteriorWalls');
  addBoxes(data.corridorFloors, material.floor, 'CorridorFloors');
  addBoxes(data.stairMeshes, material.stair, 'Stairs');
  addBoxes(data.elevatorMeshes, material.elevator, 'Elevators');
  return group;
}
