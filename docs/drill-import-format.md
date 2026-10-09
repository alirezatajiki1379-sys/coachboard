# CoachBoard Drill Import Format

CoachBoard accepts reviewed ZIP packages in **schema version 1**. The package is parsed and validated locally in the browser before any Drill or image is persisted.

## Package layout

```text
coachboard-import.zip
├── drills.json
└── images/
    ├── 001.jpg
    ├── 002.png
    └── 003.webp
```

`drills.json` must be at the ZIP root. Image paths are case-sensitive and relative to the ZIP root. Absolute paths, empty path segments, backslashes, drive prefixes and `..` are rejected.

## Manifest

```json
{
  "schemaVersion": 1,
  "batch": {
    "name": "Synthetic October collection",
    "source": {
      "title": "Coach education notes",
      "publisher": "Example federation",
      "reference": "Private coaching archive"
    }
  },
  "drills": [
    {
      "externalId": "example-001",
      "title": "4v4 with transition",
      "shortDescription": "Keep possession and react after losing the ball.",
      "organization": "Mark a 24 x 18 metre area.",
      "coachingPoints": [
        "Scan before receiving",
        "React immediately after transition"
      ],
      "variations": "Limit touches.",
      "easierVersion": "Add a neutral Player.",
      "harderVersion": "Reduce the area.",
      "durationMinutes": 15,
      "minPlayers": 8,
      "maxPlayers": 12,
      "mainFocus": "Transition",
      "subFocus": "Counter-pressing after loss",
      "trainingBlocks": ["Main part 1"],
      "drillType": "Small-sided game",
      "ageMode": "preset",
      "ageGroups": ["U15", "U16"],
      "difficultyLevel": 3,
      "intensityLevel": 4,
      "tags": ["transition", "4v4"],
      "materials": [
        { "type": "balls", "quantity": 4 },
        { "type": "cones", "color": "Red", "quantity": 8 }
      ],
      "image": "images/001.jpg",
      "source": {
        "title": "Example training catalogue",
        "publisher": "Example federation",
        "page": "42",
        "reference": "Exercise 7"
      }
    }
  ]
}
```

## Canonical values

`mainFocus`, `trainingBlocks`, `drillType`, age groups, material types and material colors must use CoachBoard's canonical English storage values from `config/options.ts` and `types/domain.ts`. User-facing German labels are presentation only.

Required for a ready item:

- `title`
- supported `mainFocus`
- supported `drillType`

Defaults that are explicitly shown as warnings during review:

- missing `durationMinutes`: `10`
- missing `minPlayers`: `1`
- missing `maxPlayers`: `minPlayers`
- missing difficulty or intensity: `3`
- missing age information: all ages

CoachBoard never presents these defaults as facts from the original source.

`coachingPoints` and `variations` may be strings or ordered string arrays. Arrays are retained in order and stored as newline-separated text in the current Drill domain.

## Images

Supported content and extensions:

- JPEG: `.jpg`, `.jpeg`
- PNG: `.png`
- WebP: `.webp`

CoachBoard checks image magic bytes, not only filenames. Each image must be at most 10 MB. The ZIP is limited to 100 MB, 220 files, 250 MB declared uncompressed data and 100 Drills. Imported images use the existing private `drill-images` bucket and `drill_graphics` model.

## Source provenance

Source values are optional but should be retained whenever content originated outside CoachBoard:

- `title`
- `publisher`
- `page`
- `reference`
- `externalId` for a stable source identifier

Item-level source values override batch-level source values. Source information is displayed subtly in Drill Detail and is retained when the Drill is edited or duplicated.

## Duplicate behavior

CoachBoard checks, in order:

1. exact external ID;
2. exact source title and page;
3. normalized exact title;
4. deterministic high-overlap title similarity.

Only external-ID and source-page matches can be updated directly. All other matches default to **Skip** or require **Import anyway**. Existing Drills are never overwritten silently.

## Validate a generated package

```bash
npm run validate:drill-import -- /absolute/path/to/coachboard-import.zip
```

Generate a synthetic five-Drill package:

```bash
npm run fixture:drill-import -- /tmp/coachboard-drill-import-fixture.zip
```

The fixture contains fictional content only. Do not commit copyrighted catalogue material or original source PDFs.
