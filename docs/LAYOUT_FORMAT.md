# Layout JSON Format

The save file is intended to remain portable into the future Android app. Save/load is not yet wired into the current UI, but the schema below defines how the new construction data should persist when that feature is implemented.

## Conceptual shape

```json
{
  "version": 2,
  "units": "inches",
  "moveSnap": 0.5,
  "groundCollision": true,
  "solidCollision": true,
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
      "assemblyId": "wall-a42",
      "role": "common-stud",
      "stock": {
        "family": "lumber",
        "itemId": "2x4",
        "stockLength": 96,
        "cutLength": 73.5
      },
      "operations": [
        {
          "type": "endCut",
          "end": "B",
          "miter": 0,
          "bevel": 12.5
        },
        {
          "type": "notch",
          "face": "top",
          "start": 24,
          "length": 3.5,
          "offset": 0,
          "span": 3.5,
          "depth": 0.75
        }
      ]
    },
    {
      "id": "cc9cc720-b0a2-45fc-ac37-e687b770bc8f",
      "type": "stock",
      "position": [0, 40, 0.375],
      "rotation": [0, 0, 0],
      "stock": {
        "family": "sheet",
        "itemId": "plywood",
        "stockLength": 96,
        "stockWidth": 48,
        "cutLength": 60,
        "cutWidth": 32,
        "thickness": 0.75
      },
      "operations": []
    }
  ],
  "assemblies": [
    {
      "id": "wall-a42",
      "type": "wall",
      "length": 120,
      "leftHeight": 96,
      "rightHeight": 108,
      "spacing": 16,
      "studItemId": "2x4"
    }
  ]
}
```

## Rules

- all linear values are stored in inches.
- every persisted part has a stable UUID.
- `rotation` is currently conceptualized as Euler degrees; the final persistence implementation should explicitly define rotation order or move to quaternions before interchange becomes public/stable.
- source stock dimensions are preserved independently from the finished part dimensions.
- cut operations describe material removal/angled ends and are reapplied to regenerate the finished solid.
- selection, active transform gizmos, camera hover state, and similar UI-only editor state are not persisted as part geometry.
- touching/snapped relationships are not permanent parent-child bonds merely because two faces touch.
- `assemblyId` and `role` describe semantic membership such as a framed wall without physically parenting/welding pieces together.
- finished collision geometry is derived from the same cut operations as the visible geometry; a removed notch must not reappear as an invisible rectangular collision volume.

## Cut operations

### `endCut`

```json
{
  "type": "endCut",
  "end": "A",
  "miter": 30,
  "bevel": 10
}
```

- `end` is `A` or `B`.
- angles are degrees.
- the current editor clamps miter and bevel inputs to ±60 degrees.

### `notch`

```json
{
  "type": "notch",
  "face": "top",
  "start": 12,
  "length": 4,
  "offset": 0,
  "span": 3.5,
  "depth": 1.75
}
```

- `start` measures longitudinally from End A.
- `length` is the notch extent along the part.
- `offset` and `span` locate the cut across the selected face.
- `depth` is material removed inward from that face.
- a partial-depth notch is real removed volume and therefore usable by mating geometry.

## Versioning

Version 2 introduces source-stock dimensions, cut operations, and assembly metadata conceptually. When save/load is implemented, migrations should keep older layouts readable rather than requiring projects to be recreated.

New fields should remain optional where sensible. Any incompatible schema change should increment `version` and include an explicit migration path.

## Android compatibility

Kotlin serialization can represent the same material IDs, stock metadata, cut-operation hierarchy, placed transforms, and assembly IDs. The Android renderer may use a different solid modeling/collision library while preserving the same project meaning.
