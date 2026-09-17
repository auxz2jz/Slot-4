# Construction 3D Builder

A browser-based 3D construction editor for working with real-size building materials, cut stock, framed walls, and reusable project components. The original cinder-block / firebrick smoker tools remain available as construction components inside the broader editor.

This repository is the long-term source home for the project. The long-term target is a native Android app written in Kotlin with Jetpack Compose, so measurements, material definitions, cut operations, collision rules, assemblies, and the save format are kept portable rather than tied permanently to Three.js.

## Construction material library

### Dimensional lumber

- 1×2, 1×3, 1×4, 1×6, 1×8, 1×10, 1×12
- 2×2, 2×3, 2×4, 2×6, 2×8, 2×10, 2×12
- 4×4, 4×6, 6×6
- common 8, 10, 12, 14, and 16 ft stock lengths
- common precut stud lengths for 2×4 and 2×6
- actual finished dimensions rather than nominal dimensions in the 3D model
- source stock length retained separately from the finished cut length

### 4 × 8 sheet goods

- plywood
- OSB
- MDF
- particleboard
- drywall
- cement backer board
- rigid foam board
- common material-specific thicknesses
- custom rectangular cut length and width while retaining the original 48 × 96 in stock sheet

## Cut editor

A selected lumber or sheet part can be edited without exporting it from the project.

Implemented operations:

- change finished lumber length
- change rectangular sheet length and width
- independent miter and bevel values on End A and End B
- rectangular partial-depth notches / pockets from the top, bottom, front, or back face
- multiple notch operations on one part
- clear/reapply cut operations while keeping the original source-stock metadata

Cut geometry is generated as an actual solid. A notch is therefore empty 3D space rather than a visual mark on an unchanged rectangular collision box.

## Solid collision

Construction parts use their finished mesh for narrow-phase collision testing, including cut edges and notches.

- broad-phase world bounds skip distant objects quickly
- BVH triangle/solid tests use the actual finished geometry when objects are close
- a small contact tolerance allows surfaces to touch without treating contact as penetration
- notch cavities remain usable by other parts
- swept translation/rotation checks reduce tunneling during fast drags
- optional ground collision prevents parts from passing below Z = 0

The automated smoke test verifies that a part can occupy a removed half-depth notch, then becomes a collision when moved into the remaining solid material.

## Wall framing generator

The **Frame wall** tool creates individual real lumber pieces rather than one decorative wall object.

Current options include:

- wall length
- 16 in O.C., 24 in O.C., or another custom on-center spacing
- 2×4 or 2×6 wall framing
- one or two top plates
- optional three-stud corner packs at either end
- separate left and right wall heights to produce a sloped top line
- optional door or window rough opening
- king studs
- jack / trimmer studs
- headers
- window sill
- cripple studs above/below openings where applicable

For a sloped wall, each common stud is generated at its own required length with an angled top cut. The resulting pieces remain individually selectable/editable and retain an assembly ID and framing role.

Header board selection is a modeling input only; the editor does not currently perform structural engineering or code-required header sizing.

## Smoker components retained

- Gray CMU: **16 × 8 × 8 in**
- Yellow firebrick: **9 × 4.5 × 2.5 in**
- Grill/smoker lid envelope: **25.5 × 19.5 × 5.5 in** (shape still approximate)

## Current editor foundation

- stable UUIDs for created parts
- mouse/touch orbit controls
- add, select, move, rotate, duplicate, and delete
- 0.5-inch translation snap
- configurable rotation snap
- top, front, isometric, and frame-all camera controls
- responsive material, cut, wall-framing, and settings panels
- locally managed Three.js dependency through npm/Vite
- CSG cut geometry via `three-bvh-csg`
- BVH acceleration via `three-mesh-bvh`
- GitHub Actions build + construction-geometry smoke test

## Important next capabilities

These remain planned rather than implemented in the current version:

- graphical pencil/dimension-line cut sketching in a dedicated workbench view
- arbitrary polygon sheet cuts, circular holes, and more woodworking joints
- generic multi-selection **Trim to Plane / snap-line cut** for already-placed parts
- six-face magnetic snapping
- multi-select move/rotate
- mortar mode for masonry
- save/load project JSON
- STL export
- project material takeoff, cut-list generation, saw-kerf accounting, and scrap optimization
- undo/redo command history

The wall generator already covers the common sloped-wall case at generation time; the generic after-the-fact multi-part trim-plane tool is still a separate future feature.

## Run locally

```bash
npm install
npm run test:smoke
npm run dev
```

Production build:

```bash
npm run build
```

## Project structure

- `index.html` — application shell and editor panels
- `src/main.js` — current Three.js editor integration
- `src/model/material-catalog.js` — standard construction material definitions and real dimensions
- `src/geometry/solid-stock.js` — cut solid generation, miter/bevel ends, and CSG notches
- `src/geometry/collision.js` — finished-mesh BVH collision and swept motion
- `src/editor/wall-framer.js` — parametric wall framing planner
- `src/styles.css` — responsive UI styling
- `scripts/smoke-test.mjs` — geometry/collision/framing verification
- `docs/ARCHITECTURE.md` — behavior architecture and Android conversion plan
- `docs/LAYOUT_FORMAT.md` — portable save-file contract
- `.github/workflows/build.yml` — automated test/build verification

## Android direction

The final Android app is intended to use Kotlin + Jetpack Compose for UI. The 3D renderer can change later without changing the meaning of:

- part/material definitions and actual dimensions
- source stock vs. finished piece dimensions
- cut-operation history
- transforms
- collision policy
- framing assembly roles
- snapping/mortar policy when added
- saved project data

The goal is for Android to implement the same domain model rather than reverse-engineering behavior from the browser renderer.
