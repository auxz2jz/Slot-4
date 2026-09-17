# Smoker 3D Builder

A browser-based 3D construction editor for laying out a cinder-block / firebrick smoker and related construction components.

This repository is the long-term source home for the project. The current downloadable single-file prototype remains the behavior reference while its advanced features are moved into this modular source tree. The long-term target is a native Android app written in Kotlin with Jetpack Compose, so the project is being structured to keep the model, measurements, collision rules, snapping behavior, material definitions, and save format portable.

## Physical model

- Gray CMU: **16 × 8 × 8 in**
- Yellow firebrick: **9 × 4.5 × 2.5 in**
- Grill lid envelope: **25.5 × 19.5 × 5.5 in** (shape still approximate)

## Construction material library

The editor now includes a reusable construction-material catalog.

### Dimensional lumber

- 1×2, 1×3, 1×4, 1×6, 1×8, 1×10, 1×12
- 2×2, 2×3, 2×4, 2×6, 2×8, 2×10, 2×12
- 4×4, 4×6, 6×6
- common 8, 10, 12, 14, and 16 ft stock lengths
- common precut stud lengths for 2×4 and 2×6
- actual finished dimensions are used in the 3D model rather than nominal dimensions
- lumber records both stock length and cut length so offcuts can be calculated now and future material-takeoff tools can reuse the same data

### 4 × 8 sheet goods

- plywood
- OSB
- MDF
- particleboard
- drywall
- cement backer board
- rigid foam board
- common material-specific thicknesses

## Modular web scaffold already in this repo

The repository version currently has the basic reusable 3D foundation:

- real-size CMU, firebrick, and lid objects
- standard construction lumber and sheet-goods picker
- custom lumber cut length with offcut display
- stable UUIDs for newly created parts
- gray / yellow / dark / wood-like materials
- outlined individual objects
- mouse and touchscreen orbit controls
- add, select, move, rotate, duplicate, and delete
- 0.5-inch translation snap
- configurable rotation snap
- top, front, isometric, and frame-all camera controls
- responsive settings and material drawers
- locally managed Three.js dependency through npm/Vite

## Advanced behavior being migrated from the working standalone prototype

- six-face magnetic snapping
- skin-tight oriented collision volumes that rotate with each part
- swept collision / anti-tunneling
- optional Z=0 ground collision with a see-through grid
- mortar mode with configurable joint thickness
- firebrick-to-CMU direct butt joints
- multi-select move/rotate while parts remain independent
- save/load layout JSON
- STL export
- project-level material takeoff and cut optimization

The behavior contracts for those features are documented in `docs/ARCHITECTURE.md` and `docs/LAYOUT_FORMAT.md`, so we can port them without redefining how the app is supposed to work.

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

## Project structure

- `index.html` — web app shell
- `src/main.js` — current Three.js editor scaffold
- `src/model/material-catalog.js` — standard construction material definitions and real dimensions
- `src/styles.css` — responsive UI styling
- `docs/ARCHITECTURE.md` — behavior architecture and Android conversion plan
- `docs/LAYOUT_FORMAT.md` — portable save-file contract
- `package.json` — Vite and Three.js project dependencies

## Android direction

The final Android app will use Kotlin + Jetpack Compose for UI. The 3D renderer can change later without changing the meaning of:

- part definitions and dimensions
- stock and cut dimensions
- transforms
- snapping
- collision policy
- mortar rules
- multi-selection
- saved project data

The goal is to keep those rules out of renderer-specific and Compose-specific code so the eventual Android conversion is a translation of the same editor model rather than a rewrite of the behavior.
