import { polygonContains } from './building-collision.js';
import {
  facadeRoomModuleForFloor,
  createBuildingLayoutDescriptor
} from './building-layout.js';

const EPSILON = 1e-6;
const CORRIDOR_WIDTH = 1.8;

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area * 0.5;
}

function polygonCentroid(ring) {
  let area6 = 0, x = 0, z = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const cross = a.x * b.z - b.x * a.z;
    area6 += cross;
    x += (a.x + b.x) * cross;
    z += (a.z + b.z) * cross;
  }
  if (Math.abs(area6) < EPSILON) {
    return {
      x: ring.reduce((sum, p) => sum + p.x, 0) / ring.length,
      z: ring.reduce((sum, p) => sum + p.z, 0) / ring.length
    };
  }
  return { x: x / (3 * area6), z: z / (3 * area6) };
}

function boundsOf(ring) {
  return {
    minX: Math.min(...ring.map(p => p.x)),
    maxX: Math.max(...ring.map(p => p.x)),
    minZ: Math.min(...ring.map(p => p.z)),
    maxZ: Math.max(...ring.map(p => p.z))
  };
}

function pointAt(rect, u, v) {
  return {
    x: rect.center.x + rect.tangent.x * u + rect.normal.x * v,
    z: rect.center.z + rect.tangent.z * u + rect.normal.z * v
  };
}

function rectangleCorners(rect) {
  return [
    pointAt(rect, -rect.width / 2, -rect.depth / 2),
    pointAt(rect, rect.width / 2, -rect.depth / 2),
    pointAt(rect, rect.width / 2, rect.depth / 2),
    pointAt(rect, -rect.width / 2, rect.depth / 2)
  ];
}

function rectangleFits(polygon, rect, sampleSpacing = 1.0) {
  const corners = rectangleCorners(rect);
  const samples = [rect.center, ...corners];
  // Sample the full interior as well as the perimeter so a courtyard or concavity
  // completely enclosed by a room candidate cannot be silently covered.
  const uSteps = Math.max(1, Math.ceil(rect.width / sampleSpacing));
  const vSteps = Math.max(1, Math.ceil(rect.depth / sampleSpacing));
  for (let u = 1; u < uSteps; u++) {
    for (let v = 1; v < vSteps; v++) {
      samples.push(pointAt(rect, (u / uSteps - 0.5) * rect.width, (v / vSteps - 0.5) * rect.depth));
    }
  }
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / sampleSpacing));
    for (let j = 1; j < steps; j++) {
      const t = j / steps;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return samples.every(p => polygonContains(polygon, p.x, p.z));
}

function rectanglesOverlap(a, b, padding = 0.15) {
  const axes = [a.tangent, a.normal, b.tangent, b.normal];
  const project = (rect, axis) => {
    const center = rect.center.x * axis.x + rect.center.z * axis.z;
    const radius = Math.abs(rect.tangent.x * axis.x + rect.tangent.z * axis.z) * rect.width / 2
      + Math.abs(rect.normal.x * axis.x + rect.normal.z * axis.z) * rect.depth / 2;
    return [center - radius, center + radius];
  };
  for (const axis of axes) {
    const [a0, a1] = project(a, axis), [b0, b1] = project(b, axis);
    if (a1 + padding <= b0 || b1 + padding <= a0) return false;
  }
  return true;
}

function interiorNormal(polygon, a, b, tangent) {
  const left = { x: -tangent.z, z: tangent.x };
  const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const leftInside = polygonContains(polygon, midpoint.x + left.x * 0.5, midpoint.z + left.z * 0.5);
  const rightInside = polygonContains(polygon, midpoint.x - left.x * 0.5, midpoint.z - left.z * 0.5);
  if (leftInside === rightInside) return null;
  return leftInside ? left : { x: -left.x, z: -left.z };
}

function findCore(polygon, outer, preferredCenter, floorCount) {
  const bounds = boundsOf(outer);
  const spanX = bounds.maxX - bounds.minX, spanZ = bounds.maxZ - bounds.minZ;
  // A footprint narrower than 12m cannot host a 6m service core plus safe circulation.
  if (Math.min(spanX, spanZ) < 12) return null;
  const base = Math.max(5.8, Math.min(8.5, Math.sqrt(spanX * spanZ) * 0.19));
  const candidates = [
    [base, base * 1.12], [base * 0.88, base], [base * 0.76, base * 0.88],
    [5.8, 6.0], [5.2, 5.8]
  ];
  const step = Math.max(1.5, Math.min(3, Math.min(spanX, spanZ) / 12));
  for (const [width, depth] of candidates) {
    if (width > spanX - 1 || depth > spanZ - 1) continue;
    let best = null, bestDistance = Infinity;
    for (let x = bounds.minX + width / 2 + 0.5; x <= bounds.maxX - width / 2 - 0.5; x += step) {
      for (let z = bounds.minZ + depth / 2 + 0.5; z <= bounds.maxZ - depth / 2 - 0.5; z += step) {
        const rect = { center: { x, z }, tangent: { x: 1, z: 0 }, normal: { x: 0, z: 1 }, width, depth };
        if (!rectangleFits(polygon, rect, 1.0)) continue;
        const distance = Math.hypot(x - preferredCenter.x, z - preferredCenter.z);
        if (distance < bestDistance) { best = rect; bestDistance = distance; }
      }
    }
    if (best) {
      const elevatorCount = floorCount >= 12 ? 2 : 1;
      const zones = [
        { kind: 'stair', id: 'stair-a', center: { x: best.center.x - width * 0.27, z: best.center.z }, width: width * 0.34, depth: depth * 0.68 },
        { kind: 'stair', id: 'stair-b', center: { x: best.center.x + width * 0.27, z: best.center.z }, width: width * 0.34, depth: depth * 0.68 },
        { kind: 'elevator', id: 'elevator-a', center: { x: best.center.x, z: best.center.z - depth * 0.28 }, width: Math.min(1.8, width * 0.28), depth: Math.min(1.8, depth * 0.24) }
      ];
      if (elevatorCount === 2) zones.push({
        kind: 'elevator', id: 'elevator-b',
        center: { x: best.center.x, z: best.center.z + depth * 0.28 },
        width: Math.min(1.8, width * 0.28), depth: Math.min(1.8, depth * 0.24)
      });
      return { ...best, elevatorCount, zones };
    }
  }
  return null;
}

function nearestCorePoint(core, point) {
  const x = Math.max(core.center.x - core.width / 2 + 0.25, Math.min(point.x, core.center.x + core.width / 2 - 0.25));
  const z = Math.max(core.center.z - core.depth / 2 + 0.25, Math.min(point.z, core.center.z + core.depth / 2 - 0.25));
  return { x, z };
}

function pointInRect(rect, point) {
  const dx = point.x - rect.center.x, dz = point.z - rect.center.z;
  const u = dx * rect.tangent.x + dz * rect.tangent.z;
  const v = dx * rect.normal.x + dz * rect.normal.z;
  return Math.abs(u) < rect.width / 2 - 0.05 && Math.abs(v) < rect.depth / 2 - 0.05;
}

function routeToCore(polygon, start, end, rooms, sourceRoomId, bounds) {
  const spanX = bounds.maxX - bounds.minX, spanZ = bounds.maxZ - bounds.minZ;
  const step = 1.25;
  const cols = Math.max(1, Math.ceil(spanX / step));
  const rows = Math.max(1, Math.ceil(spanZ / step));
  const pointFor = index => ({
    x: bounds.minX + (index % cols + 0.5) * step,
    z: bounds.minZ + (Math.floor(index / cols) + 0.5) * step
  });
  const expandedRoomContains = (room, point, padding) => {
    const dx = point.x - room.rect.center.x, dz = point.z - room.rect.center.z;
    const u = dx * room.rect.tangent.x + dz * room.rect.tangent.z;
    const v = dx * room.rect.normal.x + dz * room.rect.normal.z;
    return Math.abs(u) < room.rect.width / 2 + padding
      && Math.abs(v) < room.rect.depth / 2 + padding;
  };
  const clearPoint = point => {
    for (const offset of [
      [0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]
    ]) {
      const sample = { x: point.x + offset[0], z: point.z + offset[1] };
      if (!polygonContains(polygon, sample.x, sample.z)) return false;
      if (rooms.some(room => room.id !== sourceRoomId && expandedRoomContains(room, sample, 0.05))) return false;
    }
    return true;
  };
  const clearSegment = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < 1e-5) return clearPoint(a);
    const nx = -dz / length, nz = dx / length;
    const steps = Math.max(1, Math.ceil(length / 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = { x: a.x + dx * t, z: a.z + dz * t };
      for (const side of [-CORRIDOR_WIDTH / 2, 0, CORRIDOR_WIDTH / 2]) {
        const sample = { x: center.x + nx * side, z: center.z + nz * side };
        if (!polygonContains(polygon, sample.x, sample.z)
          || rooms.some(room => room.id !== sourceRoomId && expandedRoomContains(room, sample, 0.05))) return false;
      }
    }
    return true;
  };
  const nearestNode = point => {
    const gx = Math.round((point.x - bounds.minX) / step - 0.5);
    const gz = Math.round((point.z - bounds.minZ) / step - 0.5);
    let best = -1, bestDistance = Infinity;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = gx + dx, z = gz + dz;
      if (x < 0 || x >= cols || z < 0 || z >= rows) continue;
      const index = z * cols + x, candidate = pointFor(index);
      const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
      if (distance < bestDistance && clearPoint(candidate) && clearSegment(point, candidate)) {
        best = index; bestDistance = distance;
      }
    }
    return best;
  };
  const startNode = nearestNode(start), goalNode = nearestNode(end);
  if (startNode < 0 || goalNode < 0) return null;
  const heuristic = (a, b) => {
    const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const open = [{ index: startNode, score: heuristic(pointFor(startNode), end) }];
  const costs = new Map([[startNode, 0]]);
  const parents = new Map();
  const visited = new Set();
  const directions = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];
  let found = false;
  while (open.length) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift().index;
    if (visited.has(current)) continue;
    if (current === goalNode) { found = true; break; }
    visited.add(current);
    const cx = current % cols, cz = Math.floor(current / cols), currentPoint = pointFor(current);
    for (const [dx, dz, cost] of directions) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || x >= cols || z < 0 || z >= rows) continue;
      const next = z * cols + x;
      if (visited.has(next)) continue;
      const nextPoint = pointFor(next);
      if (!clearPoint(nextPoint) || !clearSegment(currentPoint, nextPoint)) continue;
      if (dx && dz) {
        if (!clearPoint(pointFor(cz * cols + x)) || !clearPoint(pointFor(z * cols + cx))) continue;
      }
      const nextCost = costs.get(current) + cost;
      if (nextCost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, nextCost);
      parents.set(next, current);
      open.push({ index: next, score: nextCost + heuristic(nextPoint, pointFor(goalNode)) });
    }
  }
  if (!found) return null;
  const path = [];
  for (let node = goalNode; node !== undefined; node = parents.get(node)) {
    path.push(pointFor(node));
    if (node === startNode) break;
  }
  path.reverse();
  const result = [start, ...path, end];
  // Collapse collinear grid points to keep the renderer descriptor compact.
  const compact = [result[0]];
  for (let i = 1; i < result.length - 1; i++) {
    const a = compact[compact.length - 1], b = result[i], c = result[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
    if (Math.abs(abx * bcz - abz * bcx) > 0.02) compact.push(b);
  }
  compact.push(result[result.length - 1]);
  return compact;
}

/**
 * Build a deterministic, renderer-independent floor plan from one surveyed footprint polygon.
 * Room bays follow the facade shader's 2/3-window module; corridors connect each room to the core.
 */
export function planFloor(building, sourceIndex, facade, floorIndex = 0, options = {}) {
  if (!Number.isInteger(floorIndex) || floorIndex < 0 || floorIndex >= facade?.floorCount) {
    throw new RangeError('floorIndex must be inside the facade floor range.');
  }
  const descriptor = createBuildingLayoutDescriptor(building, sourceIndex, facade, options.polygonIndex || 0);
  const polygon = {
    outer: descriptor.footprint.outer,
    holes: descriptor.footprint.holes || []
  };
  if (polygon.outer.length < 3) throw new TypeError('A floor plan requires at least three outer footprint vertices.');
  const center = polygonCentroid(polygon.outer);
  const core = findCore(polygon, polygon.outer, center, facade.floorCount);
  if (!core) {
    return Object.freeze({
      id: descriptor.footprintId + ':f' + floorIndex,
      floorIndex, floorRole: options.floorRole || (floorIndex === 0 ? 'lobby' : floorIndex === facade.floorCount - 1 ? 'top' : 'standard'),
      floorHeight: facade.floorHeight, footprint: descriptor.footprint,
      core: null, rooms: Object.freeze([]), corridors: Object.freeze([]),
      connectivity: Object.freeze({ connectedRoomCount: 0, totalRoomCount: 0, isConnected: false }),
      warnings: Object.freeze(['Footprint is too narrow or irregular for a viable central core.'])
    });
  }

  const module = facadeRoomModuleForFloor(floorIndex, facade.materialSeed);
  const bayWidth = facade.windowWidth * module.bayCount;
  const roomDepths = options.roomDepths || [6.4, 5.4, 4.4];
  const candidates = [];
  let roomSequence = 0;

  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let edgeIndex = 0; edgeIndex < ring.length; edgeIndex++) {
      const a = ring[edgeIndex], b = ring[(edgeIndex + 1) % ring.length];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < bayWidth + 1) continue;
      const tangent = { x: dx / length, z: dz / length };
      const normal = interiorNormal(polygon, a, b, tangent);
      if (!normal) continue;
      const count = Math.floor((length - 0.6) / bayWidth);
      if (count < 1) continue;
      const usedLength = count * bayWidth;
      const startOffset = (length - usedLength) / 2 + module.phase * facade.windowWidth * 0.12;
      for (let bay = 0; bay < count; bay++) {
        const along = Math.min(length - bayWidth / 2 - 0.1, startOffset + bayWidth * (bay + 0.5));
        const wallPoint = { x: a.x + tangent.x * along, z: a.z + tangent.z * along };
        for (const depth of roomDepths) {
          const rect = {
            center: { x: wallPoint.x + normal.x * (depth / 2 + 0.35), z: wallPoint.z + normal.z * (depth / 2 + 0.35) },
            tangent, normal, width: bayWidth - 0.25, depth
          };
          if (!rectangleFits(polygon, rect, 0.9) || rectanglesOverlap(rect, core, 0.35)
            || candidates.some(room => rectanglesOverlap(rect, room.rect, 0.2))) continue;
          const roomId = descriptor.footprintId + ':f' + floorIndex + ':r' + roomSequence++;
          const door = {
            x: rect.center.x + normal.x * (depth / 2 - 0.05),
            z: rect.center.z + normal.z * (depth / 2 - 0.05)
          };
          candidates.push({
            id: roomId, kind: 'apartment', floorIndex,
            wallIndex: edgeIndex, bayIndex: bay,
            bayCount: module.bayCount, phase: module.phase,
            width: rect.width, depth: rect.depth,
            center: rect.center, rect, door
          });
          break;
        }
      }
    }
  }

  const connectedRooms = [], corridors = [];
  const footprintBounds = boundsOf(polygon.outer);
  for (const room of candidates) {
    const target = nearestCorePoint(core, room.door);
    const path = routeToCore(polygon, room.door, target, candidates, room.id, footprintBounds);
    if (!path) continue;
    connectedRooms.push(Object.freeze({
      id: room.id, kind: room.kind, floorIndex: room.floorIndex,
      wallIndex: room.wallIndex, bayIndex: room.bayIndex,
      bayCount: room.bayCount, phase: room.phase,
      width: room.width, depth: room.depth,
      center: Object.freeze({ ...room.center }),
      corners: Object.freeze(rectangleCorners(room.rect).map(p => Object.freeze(p))),
      door: Object.freeze(room.door)
    }));
    corridors.push(Object.freeze({
      id: room.id + ':corridor', roomId: room.id,
      width: CORRIDOR_WIDTH,
      points: Object.freeze(path.map(p => Object.freeze({ ...p })))
    }));
  }

  const floorRole = options.floorRole || (floorIndex === 0 ? 'lobby'
    : floorIndex === facade.floorCount - 1 ? 'top' : 'standard');
  return Object.freeze({
    id: descriptor.footprintId + ':f' + floorIndex,
    buildingId: descriptor.id, footprintId: descriptor.footprintId,
    floorIndex, floorRole,
    floorHeight: facade.floorHeight,
    footprint: descriptor.footprint,
    core: Object.freeze({
      center: Object.freeze({ ...core.center }),
      width: core.width, depth: core.depth,
      elevatorCount: core.elevatorCount,
      zones: Object.freeze(core.zones.map(zone => Object.freeze({
        ...zone, center: Object.freeze({ ...zone.center })
      })))
    }),
    rooms: Object.freeze(connectedRooms),
    corridors: Object.freeze(corridors),
    connectivity: Object.freeze({
      connectedRoomCount: connectedRooms.length,
      totalRoomCount: connectedRooms.length,
      candidateRoomCount: candidates.length,
      unconnectedCandidateRoomCount: candidates.length - connectedRooms.length,
      isConnected: connectedRooms.length === corridors.length
    }),
    warnings: Object.freeze(candidates.length > connectedRooms.length
      ? [`${candidates.length - connectedRooms.length} room candidates were omitted because a clear corridor route could not be found.`] : [])
  });
}
