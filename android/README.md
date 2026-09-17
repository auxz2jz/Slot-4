# Construction 3D Builder — Android

This folder is the clean native rewrite of Construction 3D Builder. The browser prototype at the repository root remains untouched and serves as a behavioral reference.

## First native milestone

Implemented in this bootstrap:

- Kotlin domain model for projects, parts, transforms, source stock, and non-destructive cut operations
- dimensional-lumber and sheet-goods catalog using real dimensions
- parametric wall-framing planner that produces individual members with roles and assembly IDs
- Jetpack Compose application shell with Workspace, Materials, Build, and Project screens
- project state that can add stock materials and generated wall members before the 3D renderer is introduced
- JVM unit tests for material dimensions and wall-framing output

The 3D renderer, solid geometry/CSG, exact collision, save/load, and undo/redo are intentionally not included in this first native commit. They will be added behind the stable model instead of being mixed into the UI.

## Toolchain

- Android Gradle Plugin 9.4.0
- Gradle 9.6.0 target
- JDK 17
- Kotlin 2.3.21
- Jetpack Compose BOM 2026.08.00
- minSdk 26 / targetSdk 37

Open the `android` folder as a project in Android Studio. The Gradle wrapper binary is intentionally not committed in this bootstrap; Android Studio can configure/generate the wrapper during the first local setup, after which we can commit the generated wrapper as a normal checkpoint.
