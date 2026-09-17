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

Current definitions:

| Type | Dimensions |
| --- | --- |
| `cmu` | 16 × 8 × 8 in |
| `firebrick` | 9 × 4.5 × 2.5 in |
| `lid` | 25.5 × 19.5 × 5.5 in envelope |

### PlacedPart

Each placed object should store:

- unique id
- type
- position `(x, y, z)` in inches
- rotation `(rx, ry, rz)` or quaternion
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
2. `model/project-state.js`
3. `geometry/obb.js`
4. `geometry/collision.js`
5. `editor/snapping.js`
6. `editor/mortar.js`
7. `editor/selection.js`
8. `render/three-scene.js`
9. `ui/controls.js`
10. `io/layout-json.js`
11. `io/stl-export.js`

Do this incrementally so the working prototype stays usable.
