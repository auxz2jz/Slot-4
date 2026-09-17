# Layout JSON Format

The save file is intended to remain portable into the future Android app.

Current conceptual shape:

```json
{
  "version": 1,
  "units": "inches",
  "moveSnap": 0.5,
  "groundCollision": true,
  "mortarEnabled": false,
  "mortarThickness": 0.375,
  "magneticSixFaceSnap": true,
  "parts": [
    {
      "type": "cmu",
      "position": [0, 0, 4],
      "rotation": [0, 0, 0]
    }
  ]
}
```

## Rules

- `position` is stored in inches.
- `rotation` is currently stored as Euler degrees.
- positions represent canonical dry-stack placement; mortar spacing is derived.
- selection is editor UI state and should not be persisted.
- touching/snapped relationships are not permanent bonds and should not be persisted as parent-child links.
- future versions should add stable part IDs before project-to-project references are introduced.

## Android compatibility

Kotlin serialization can directly represent this schema. A future migration can add fields while preserving backward compatibility by incrementing `version`.
