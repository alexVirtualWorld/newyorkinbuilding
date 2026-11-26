# Vertical Building Program — Visual QA

Date: 2026-11-27
Target: One World Trade Center surveyed footprint
Viewport: 1600 × 900
Camera: same preview camera for before/after
Renderer: Three.js WebGL2 fallback (WebGPU adapter unavailable)

## Screenshots

- `before-uniform-office-floors.png` — previous uniform office-floor layout.
- `after-vertical-zoning.png` — vertical program roles and role-specific materials.

## Configured demonstration profile

This is an explicit `mixed-use-landmark` procedural profile. The NYC survey record supplies footprint, height and year, but not authoritative floor-use tags. The generated floor schedule is therefore a configurable demonstration, not a verified as-built floor allocation.

| Role | Floors |
|---|---:|
| Lobby | 1 |
| Retail | 2 |
| Standard | 94 |
| Mechanical | 5 |
| Refuge | 4 |
| Observation | 3 |
| Roof | 1 |
| Total | 110 |

The roof floor omits office room partitions and adds four rooftop equipment units.

## Browser verification

- 110/110 floors have a valid core.
- 3,110 connected room zones.
- 4 rooftop equipment units.
- No JavaScript exceptions.
- Visual bands for lobby, retail, mechanical, refuge and observation floors are visible in the after screenshot.
