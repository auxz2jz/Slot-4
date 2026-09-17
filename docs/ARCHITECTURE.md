# Architecture and Android Migration Notes

## Goal

Treat the browser app as a behavior prototype, not disposable code. The rendering/UI layer can be replaced later, but the domain rules should remain the same.

## Domain concepts to keep renderer-independent

### PartDefinition

Each placeable object should have:

- stable `type`
- display name
- dimensions in inches
- visual material/color
- collision dimensions
- local collision center
- optional mesh/profile metadata

Current smoker definitions:

| Type | Dimensions |
| --- | --- |
| `cmu` | 16 × 8 × 8 in |
| `firebrick` | 9 × 4.5 × 2.5 in |
| `lid` | 25.5 × 19.5 × 5.5 in envelope |

### ConstructionMaterialDefinition

Reusable stock materials are separate from placed instances. The current catalog lives in `src/model/material-catalog.js` and includes:

- dimensional lumber with nominal names and actual finished cross-sections
- common stock lengths
- common precut stud lengths
- 4 × 8 sheet goods with material-specific thicknesses

Lumber definitions distinguish between nominal size (for example `2 × 4`) and actual dimensions (for example `1.5 × 3.5 in`).

### StockUsage

A placed construction material may retain information about the stock piece it came from.

For lumber this currently includes:

- stock length
- cut length
- resulting offcut (`stockLength - cutLength`)

This is intentionally part of the domain model rather than only the UI so future features can generate material takeoffs, cut lists, and waste estimates without changing existing project files.

Future sheet-cutting support should follow the same idea by retaining source sheet width/length and the rectangular piece removed from it.

### PlacedPart

Each placed object should store:

- stable unique id (UUID)
- type
- position `(x, y, z)` in inches
- rotation `(rx, ry, rz)` or quaternion
- material/source-stock metadata when applicable
- selection state only at runtime
- no permanent parent/attachment just because two faces touch

### Collision

Collision is based on oriented bounding boxes (OBBs).

Requirements:

- collision box follows every rotation
- touching is legal
- overlap is illegal
- swept motion prevents tunneling
- group-selected parts ignore collisions with each other while moving as a group
- optional ground plane collision at `z = 0`

### Snapping

- translation grid: 0.5 in
- magnetic face snapping: all six faces
- magnetic snap must not weld or parent objects
- a deliberate 0.5-inch move must release a snap
- touching objects remain independently movable

### Mortar

Mortar must not alter the real dimensions of a part.

Current rule:

- CMU ↔ CMU: mortar joint may apply
- firebrick ↔ firebrick: mortar joint may apply
- firebrick ↔ CMU: direct butt joint, zero automatic mortar gap
- mortar OFF restores dry-stack positions

### Multi-selection

- selection is temporary editor state
- multiple objects can translate/rotate about a shared pivot
- objects remain independent afterward
- group motion still collides with non-selected objects and ground

## Android mapping

A future Kotlin project can map these concepts approximately as:

- `PartDefinition` → Kotlin data class
- `ConstructionMaterialDefinition` → Kotlin data class/catalog
- `StockUsage` → Kotlin data class
- `PlacedPart` → Kotlin data class with UUID
- editor/project state → ViewModel + StateFlow
- menus/settings → Jetpack Compose
- project persistence → Kotlin serialization / Room if needed
- 3D rendering → Android-capable renderer selected later
- collision/snapping → pure Kotlin math/domain module where possible
- STL export → dedicated exporter module

The key design constraint is to avoid putting domain rules directly inside Compose components or renderer-specific nodes.

## Refactor path for the web prototype

The current working prototype can be split incrementally into:

1. `model/part-definitions.js`
2. `model/material-catalog.js` (started)
3. `model/project-state.js`
4. `geometry/obb.js`
5. `geometry/collision.js`
6. `editor/snapping.js`
7. `editor/mortar.js`
8. `editor/selection.js`
9. `render/three-scene.js`
10. `ui/controls.js`
11. `io/layout-json.js`
12. `io/stl-export.js`
13. `io/material-takeoff.js`

Do this incrementally so the working prototype stays usable.
