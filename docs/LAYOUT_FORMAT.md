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
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "cmu",
      "position": [0, 0, 4],
      "rotation": [0, 0, 0]
    },
    {
      "id": "7ddfa7f4-19f3-4cb4-9701-cd8cb026f051",
      "type": "stock",
      "position": [20, 0, 1.75],
      "rotation": [0, 0, 0],
      "stock": {
        "family": "lumber",
        "itemId": "2x4",
        "stockLength": 96,
        "cutLength": 73.5
      }
    }
  ]
}
```

## Rules

- `position` is stored in inches.
- `rotation` is currently stored as Euler degrees.
- every persisted part should have a stable UUID.
- positions represent canonical dry-stack placement; mortar spacing is derived.
- selection is editor UI state and should not be persisted.
- touching/snapped relationships are not permanent bonds and should not be persisted as parent-child links.
- construction-material parts may persist source stock metadata separately from their rendered dimensions.
- for lumber, rendered length is currently the cut length while stock length remains available for takeoff/offcut calculations.
- future sheet-cutting support should retain the original source sheet dimensions and the cut rectangle without changing the meaning of existing files.

## Versioning

New fields should remain optional when possible. Any incompatible schema change should increment `version` and include a migration path so older browser projects can still open in the later Android application.

## Android compatibility

Kotlin serialization can directly represent this schema. The material catalog can use the same stable IDs (`2x4`, `plywood`, and so on) while the UI and 3D renderer are replaced.
