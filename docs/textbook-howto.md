# How to Add a Textbook Regression Problem in Under 5 Minutes

This guide explains how to convert a textbook exercise or exam problem into an automated regression test in `testing/textbook/problems/`.

---

## Folder Structure

```
testing/textbook/
├── problem.schema.json    # JSON Schema definition for all textbook problems
├── validate.ts            # Fast schema validator script
├── inbox/                 # Staging area for raw problem statements, images, or draft JSONs
└── problems/              # Verified problem JSON files executed by Vitest
```

---

## 5-Minute Step-by-Step Workflow

### Step 1: Create a New JSON File
Create a new file in `testing/textbook/problems/<author>_ch<chapter>_prob<number>.json` (for example, `ndbhatt_ch13_prob04.json`).

### Step 2: Paste the Minimal Template

```json
{
  "id": "ndbhatt_ch13_prob04",
  "source": {
    "book": "Elementary Engineering Drawing",
    "author": "N.D. Bhatt",
    "chapter": 13,
    "problemNumber": 4,
    "page": 302
  },
  "statement": "Paste the verbatim problem text from the textbook here.",
  "solid": {
    "type": "PYRAMID",
    "sides": 4,
    "baseSize": 40,
    "height": 65
  },
  "placement": {
    "initialAxis": "PERPENDICULAR_TO_HP",
    "baseRotationDeg": 0,
    "thetaDeg": 30,
    "phiDeg": 0,
    "distanceHP": 0,
    "distanceVP": 20,
    "restingCondition": "Resting on a base corner on HP with axis inclined at 30° to HP"
  },
  "expected": {
    "frontView": {
      "apparentAxisLength": 65,
      "apparentAxisAngleDeg": 30
    },
    "topView": {
      "apparentAxisLength": 56.29
    }
  },
  "needsHumanCheck": false,
  "notes": "Stage 2 tilt in elevation plane gives foreshortened plan axis length = 65 * cos(30°) = 56.29 mm."
}
```

### Step 3: Configure Solid Geometry
Supported solid types:
- `PRISM`: set `sides` (3, 4, 5, 6), `baseSize` (mm), `height` (mm).
- `PYRAMID`: set `sides` (3, 4, 5, 6), `baseSize` (mm), `height` (mm).
- `CYLINDER`: set `baseSize` (base radius in mm), `height` (mm).
- `CONE`: set `baseSize` (base radius in mm), `height` (mm).
- `FRUSTUM_CONE`: set `baseSize` (bottom radius), `topSize` (top radius), `height`.
- `FRUSTUM_PYRAMID`: set `sides`, `baseSize` (bottom side), `topSize` (top side), `height`.

### Step 4: Configure Placement Parameters
- `initialAxis`: `'PERPENDICULAR_TO_HP'` (default) or `'PERPENDICULAR_TO_VP'`.
- `baseRotationDeg`: rotation in degrees around solid axis to align base edge/corner (default 0).
- `thetaDeg`: Stage 2 tilt angle of axis with HP (90° = vertical; 0° = horizontal).
- `phiDeg`: Stage 3 yaw angle of axis with VP (0° = parallel to VP).
- `distanceHP`: mm above HP for nearest point (default 0).
- `distanceVP`: mm in front of VP for nearest point (default 20).

### Step 5: Read Expected Dimensions
From the textbook's published solution figure, extract one or more key check dimensions:
- `frontView.height`: overall bounding height in elevation.
- `frontView.width`: overall bounding width in elevation.
- `frontView.apparentAxisLength`: apparent length of axis in front view.
- `topView.apparentAxisLength`: foreshortened axis length in top view ($L \cos\theta$).

### Step 6: Ambiguous Statements ("Needs Human Check")
If the textbook statement is ambiguous (e.g. "plan of axis inclined at 45°" vs "true axis inclined at 45°", or rounding generator angles), **do not force a pass**:
1. Set `"needsHumanCheck": true`.
2. Provide a clear explanation in `"humanCheckReason": "..."`.
The test suite will execute the geometry, log the discrepancies, and flag the problem for instructor/editorial review without failing CI.

### Step 7: Run Validation & Regression Tests
Run the test suite:
```bash
npm test
```
Or validate your JSON file directly:
```bash
npx vitest run src/kernel/__tests__/textbook.test.ts
```

---

## Common Gotchas
1. **Units**: All dimensions must be in millimetres (`mm`), angles in degrees (`Deg`) or radians (`Rad`).
2. **Radius vs Diameter**: `baseSize` for cylinders and cones is the **radius** in mm ($R = D/2$).
3. **Square Base Alignment**: The parametric builder creates a square with diagonals along the coordinate axes ($40 \sqrt{2} \approx 56.57\text{ mm}$ across corners). Use `baseRotationDeg: 0` for faces equally inclined at 45° to VP, or `baseRotationDeg: 45` for faces parallel/perpendicular to VP.
