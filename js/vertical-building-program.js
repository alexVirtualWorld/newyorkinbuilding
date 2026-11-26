/**
 * Deterministic vertical zoning for surveyed buildings.
 *
 * Survey source currently provides footprint, height and construction year, but not reliable
 * building-use tags. Therefore use profiles are explicit; height selects a sensible default
 * profile, while landmark/mixed-use functions require an explicit profile.
 */
export const VERTICAL_PROGRAM_PROFILES = Object.freeze({
  lowRise: Object.freeze({
    id: 'low-rise',
    firstMechanicalFloor: null,
    mechanicalInterval: 0,
    refugeInterval: 0,
    retailPodiumFloors: 0,
    observationFloors: 0
  }),
  officeTower: Object.freeze({
    id: 'office-tower',
    firstMechanicalFloor: 5,
    mechanicalInterval: 25,
    refugeInterval: 25,
    retailPodiumFloors: 0,
    observationFloors: 0
  }),
  mixedUseLandmark: Object.freeze({
    id: 'mixed-use-landmark',
    firstMechanicalFloor: 5,
    mechanicalInterval: 25,
    refugeInterval: 25,
    retailPodiumFloors: 2,
    observationFloors: 3
  })
});

export function verticalProgramProfileFor(building, facade, requestedProfile) {
  if (!building || !facade || !Number.isInteger(facade.floorCount) || facade.floorCount < 1) {
    throw new TypeError('A surveyed building and valid facade floor count are required.');
  }
  const profile = requestedProfile
    ? Object.values(VERTICAL_PROGRAM_PROFILES).find(item => item.id === requestedProfile)
    : facade.floorCount >= 12 ? VERTICAL_PROGRAM_PROFILES.officeTower : VERTICAL_PROGRAM_PROFILES.lowRise;
  if (!profile) throw new RangeError('Unknown vertical program profile: ' + requestedProfile);
  return profile;
}

export function buildVerticalBuildingProgram(building, facade, options = {}) {
  const profile = verticalProgramProfileFor(building, facade, options.profile);
  const floorCount = facade.floorCount;
  const floors = Array.from({ length: floorCount }, (_, floorIndex) => ({
    floorIndex,
    role: 'standard',
    kind: 'office',
    label: 'Office'
  }));

  floors[0] = { floorIndex: 0, role: 'lobby', kind: 'public-lobby', label: 'Lobby' };

  for (let floor = 1; floor <= Math.min(profile.retailPodiumFloors, floorCount - 2); floor++) {
    floors[floor] = { floorIndex: floor, role: 'retail', kind: 'retail', label: 'Retail' };
  }

  if (profile.firstMechanicalFloor !== null) {
    for (let floor = profile.firstMechanicalFloor; floor < floorCount - 1; floor += profile.mechanicalInterval) {
      floors[floor] = { floorIndex: floor, role: 'mechanical', kind: 'building-services', label: 'Mechanical' };
    }
  }

  if (profile.refugeInterval > 0 && floorCount >= 40) {
    for (let floor = profile.refugeInterval; floor < floorCount - profile.observationFloors - 1; floor += profile.refugeInterval) {
      if (floors[floor]?.role === 'standard') {
        floors[floor] = { floorIndex: floor, role: 'refuge', kind: 'life-safety', label: 'Refuge' };
      }
    }
  }

  const observationStart = Math.max(1, floorCount - profile.observationFloors - 1);
  for (let floor = observationStart; floor < floorCount - 1; floor++) {
    if (profile.observationFloors > 0) {
      floors[floor] = { floorIndex: floor, role: 'observation', kind: 'public-observation', label: 'Observation' };
    }
  }

  if (floorCount > 1) {
    floors[floorCount - 1] = { floorIndex: floorCount - 1, role: 'roof', kind: 'roof-plant', label: 'Roof' };
  }

  const counts = Object.freeze(floors.reduce((result, floor) => {
    result[floor.role] = (result[floor.role] || 0) + 1;
    return result;
  }, {}));

  return Object.freeze({
    profile: profile.id,
    floorCount,
    buildingHeight: building.height,
    constructionYear: building.year || null,
    floors: Object.freeze(floors.map(floor => Object.freeze(floor))),
    counts
  });
}
