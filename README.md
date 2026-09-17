# Smoker 3D Builder

A browser-based 3D construction editor for laying out a cinder-block / firebrick smoker.

This repository is now the long-term source home for the project. The current downloadable single-file prototype remains the behavior reference while its advanced features are moved into this modular source tree. The long-term target is a native Android app written in Kotlin with Jetpack Compose, so the project is being structured to keep the model, measurements, collision rules, snapping behavior, and save format portable.

## Physical model

- Gray CMU: **16 × 8 × 8 in**
- Yellow firebrick: **9 × 4.5 × 2.5 in**
- Grill lid envelope: **25.5 × 19.5 × 5.5 in** (shape still approximate)

## Modular web scaffold already in this repo

The repository version currently has the basic reusable 3D foundation:

- real-size CMU, firebrick, and lid objects
- gray / yellow / dark materials
- outlined individual objects
- mouse and touchscreen orbit controls
- add, select, move, rotate, duplicate, and delete
- 0.5-inch translation snap
- configurable rotation snap
- top, front, isometric, and frame-all camera controls
- responsive settings drawer

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

The behavior contracts for those features are already documented in `docs/ARCHITECTURE.md` and `docs/LAYOUT_FORMAT.md`, so we can port them without redefining how the app is supposed to work.

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

## Project structure

- `index.html` — web app shell
- `src/main.js` — current modular Three.js editor scaffold
- `src/styles.css` — responsive UI styling
- `docs/ARCHITECTURE.md` — behavior architecture and Android conversion plan
- `docs/LAYOUT_FORMAT.md` — portable save-file contract
- `package.json` — Vite development/build tooling

## Android direction

The final Android app will use Kotlin + Jetpack Compose for UI. The 3D renderer can change later without changing the meaning of:

- part definitions and dimensions
- transforms
- snapping
- collision policy
- mortar rules
- multi-selection
- saved project data

The goal is to keep those rules out of renderer-specific and Compose-specific code so the eventual Android conversion is a translation of the same editor model rather than a rewrite of the behavior.
