# Smoker 3D Builder

A browser-based 3D construction prototype for laying out a cinder-block / firebrick smoker.

This repository is the working source for the current browser prototype. The long-term target is a native Android app written in Kotlin with Jetpack Compose, so the project is being structured to keep the model, measurements, collision rules, snapping behavior, and save format portable.

## Current model

- Gray CMU: **16 × 8 × 8 in**
- Yellow firebrick: **9 × 4.5 × 2.5 in**
- Grill lid envelope: **25.5 × 19.5 × 5.5 in** (shape still approximate)
- 0.5-inch translation snap
- Configurable rotation snap
- Six-face magnetic snapping
- Skin-tight oriented collision volumes that rotate with each part
- Optional Z=0 ground collision while the grid remains see-through
- Mortar mode with configurable joint thickness
- Firebrick-to-CMU faces butt directly together with zero automatic mortar gap
- Multi-select move/rotate while parts remain independent
- Save/load layout JSON
- STL export
- Mouse and touch camera controls

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

You can also keep using the standalone prototype in `prototype/Smoker_3D_Builder_Standalone.html`.

## Project structure

- `index.html` — web app shell
- `src/main.js` — current 3D editor logic
- `src/styles.css` — UI styling
- `prototype/Smoker_3D_Builder_Standalone.html` — single-file fallback build
- `docs/ARCHITECTURE.md` — architecture and Android conversion plan
- `docs/LAYOUT_FORMAT.md` — save-file contract

## Android direction

The final Android app will use Kotlin + Jetpack Compose for UI. The 3D renderer can change later without changing the meaning of:

- part dimensions and types
- transforms
- snapping
- collision policy
- mortar rules
- multi-selection
- saved project data

Keeping those concepts explicit in the browser prototype should make the eventual Android conversion much cleaner.
