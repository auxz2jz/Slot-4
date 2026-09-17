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
- source-stock metadata where applicable
- cut-operation history where applicable
- optional mesh/profile metadata

Current smoker/component definitions include CMU, firebrick, and the approximate smoker lid. Construction material definitions live separately in `src/model/material-catalog.js`.

### ConstructionMaterialDefinition

Reusable stock materials are separate from placed instances. The catalog includes:

- dimensional lumber with nominal names and actual finished cross-sections
- common stock lengths and precut stud lengths
- 4 × 8 sheet goods with material-specific thicknesses

Nominal lumber size is presentation/catalog data. Geometry uses actual dimensions.

### StockUsage

A placed construction piece retains the stock it came from separately from its current finished dimensions.

For lumber:

- item ID / nominal size
- stock length
- finished cut length

For sheet goods:

- source sheet length and width
- finished rectangular length and width
- thickness

This data is needed later for takeoff, cut-list, kerf, and scrap optimization.

### CutOperation

Cuts are represented as operations, then converted into finished solid geometry.

Current operations:

- `endCut`: End A or End B with independent miter and bevel angles
- `notch`: face, start position, longitudinal length, across-face offset/span, and depth

The source-stock identity survives editing. A selected part can therefore be rebuilt after changing dimensions or operations without turning it into an unrelated mesh.

Future cut operations can add arbitrary profile/polygon cuts, bores, dados/rabbets, trim planes, and other joinery while preserving this same model.

### PlacedPart

Each placed object should store:

- stable UUID
- type/material reference
- position `(x, y, z)` in inches
- rotation
- source stock metadata when applicable
- cut operations when applicable
- optional assembly ID and semantic role
- selection state only at runtime
- no permanent parent/attachment merely because two faces touch

### Finished solid geometry

A construction part is generated from:

`stock definition -> finished dimensions -> cut operations -> finished solid mesh`

The rendered mesh and collision representation derive from that finished solid. The application must never preserve a full rectangular collision box across material that has actually been removed by a notch/cut.

Current web implementation lives in `src/geometry/solid-stock.js` and uses CSG subtraction for rectangular notches.

### Collision

The current collision pipeline is solid-aware rather than only oriented-box collision:

1. world-space bounding boxes provide a fast broad phase;
2. close candidates use BVH-accelerated tests against the finished triangle geometry;
3. containment is checked so a solid entirely inside another is still detected;
4. a small contact tolerance allows touching surfaces without treating contact as penetration;
5. swept transform sampling checks intermediate translation/rotation states to reduce tunneling;
6. optional ground collision enforces `z >= 0`.

Consequences:

- angled cut faces participate in collision;
- notch cavities remain empty collision space;
- a mating board can occupy a notch;
- moving that board into remaining wood is a collision.

`src/geometry/collision.js` contains the current web implementation. A future Kotlin version should preserve these behavioral rules even if it uses a different geometric engine.

### WallAssembly

A generated wall is a logical assembly of independent lumber parts.

The wall definition can include:

- length
- left/right height
- on-center stud spacing
- stud/plate material
- single/double top plate
- left/right corner packs
- optional door/window opening
- header selection

Generated pieces carry:

- `assemblyId`
- role such as `bottom-plate`, `top-plate`, `common-stud`, `king-stud`, `jack-stud`, `header`, `window-sill`, or cripple role
- their own stock/cut metadata and transforms

For a sloped wall, individual stud lengths and top cut operations are derived from the slope rather than faking the slope as a single wall object.

The assembly should eventually remain parametrically editable until deliberately exploded/unlinked, but the current web implementation generates editable independent members immediately.

### Snapping

Planned behavior remains:

- translation grid: 0.5 in
- magnetic face snapping
- magnetic snap must not weld or parent objects
- touching parts remain independently movable

### Mortar

Mortar remains a masonry-specific future mode and must not alter the real dimensions of a part.

### Multi-selection and trim plane

Planned behavior:

- multiple objects can translate/rotate about a shared pivot
- group motion collides with non-selected geometry and ground
- a future generic trim-plane command can cut every selected part against one line/plane

The current wall-framing generator already derives individual sloped stud cuts when left and right wall heights differ, but generic after-the-fact multi-part trimming is not yet implemented.

## Android mapping

A future Kotlin project can map these concepts approximately as:

- `PartDefinition` -> Kotlin data class
- `ConstructionMaterialDefinition` -> Kotlin data class/catalog
- `StockUsage` -> Kotlin data class
- `CutOperation` -> sealed class / serializable operation hierarchy
- `PlacedPart` -> Kotlin data class with UUID
- `WallAssembly` -> Kotlin data class / generator service
- editor/project state -> ViewModel + StateFlow
- menus/settings -> Jetpack Compose
- project persistence -> Kotlin serialization / Room if needed
- 3D rendering -> Android-capable renderer selected later
- solid/collision math -> geometry/domain service independent of Compose
- STL export -> dedicated exporter module

The key design constraint is to avoid putting domain rules directly inside Compose components or renderer-specific nodes.

## Current web modules

- `model/material-catalog.js`
- `geometry/solid-stock.js`
- `geometry/collision.js`
- `editor/wall-framer.js`
- `main.js` for current renderer/editor integration

Additional planned separation:

1. `model/project-state.js`
2. `editor/snapping.js`
3. `editor/mortar.js`
4. `editor/selection.js`
5. `editor/trim-plane.js`
6. `render/three-scene.js`
7. `ui/controls.js`
8. `io/layout-json.js`
9. `io/stl-export.js`
10. `io/material-takeoff.js`

Refactor incrementally so the working prototype remains usable.
