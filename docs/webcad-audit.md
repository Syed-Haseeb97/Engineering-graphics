# WebCAD Architectural Audit

Audit of [github.com/elhakimz/webcad](https://github.com/elhakimz/webcad) (cloned into `reference/webcad`) as a reference for the Engineering Graphics platform.

> **Status**: Completed  
> **Policy**: READ-ONLY. No code copied into `src/`.

---

## 1. Executive Summary & Verification

### Test and Build Verification
We cloned `webcad` into `reference/webcad`, installed dependencies, and ran all verification scripts:
- **`npm install`**: Succeeded (installed 310 packages, audited 311 packages; flagged 16 vulnerabilities and deprecated dependencies: `defekt@9.3.0`, `uuid@10.0.0`).
- **`npm test` (Vitest)**: **PASSED (332 tests across 63 test files)** in 16.16s.
- **`npm run typecheck` (`tsc --noEmit`)**: **PASSED** (0 TypeScript compile errors).
- **`npm run lint` (`eslint .`)**: **PASSED with 0 errors, but 904 warnings** (almost entirely `@typescript-eslint/no-explicit-any` across core engine, model, and worker files).
- **`npm run build` (`vite build`)**: **PASSED** in 40.42s. Generated 65.8 MB `opencascade.wasm` and 4.56 MB main JS bundle.

---

## 2. Repository Folder Map

```text
reference/webcad/
├── docs/                   # Internal design specs, refactoring docs, 3D/scad/rendering roadmaps
├── files/                  # Sample DXF and STEP test drawings
├── public/
│   ├── fonts/              # osifont.ttf (ISO 3098 CAD font), helvetiker_regular.typeface.json
│   ├── icons/black_blue/   # SVG toolbar icons (from LibreCAD)
│   └── sqlite3.wasm        # SQLite WASM binary for OPFS storage
├── src/
│   ├── app.ts              # Application coordinator & event binder
│   ├── core/
│   │   ├── commands/       # 70+ interactive command state machines (Line, Circle, Dim, Box, etc.)
│   │   ├── engine/         # CommandManager, SnapEngine, MathUtils, SelectionEngine, Solvers
│   │   │   └── handlers/   # Action handlers (IO, Layer, Plot, Transform, View, System)
│   │   ├── io/             # DXF import/export, OCCWorker (OCCT WASM worker), OpenCascadeService
│   │   ├── model/          # CAD entity classes (Entity, Line, Circle, Dimension, Solid3D, etc.)
│   │   ├── persistence/    # IndexedDB / RxDB / OPFS document storage
│   │   ├── plot/           # PlotEngine, PlotSVGRenderer, TextToPath
│   │   └── sketcher/       # 2D constraint solver (PBD / DoF analysis)
│   ├── render/             # Three.js viewport viewer, grid, gizmo, RendererBackend seam
│   ├── scad/               # OpenSCAD parser, AST, interpreter, fastmath
│   ├── testing/            # TestBridge.ts (in-app test harness exposed on window.__webcadTest)
│   └── ui/                 # DOM-based toolbars, tool windows, ribbon, command-line console
└── tests/
    ├── commands/           # Command integration tests
    └── e2e/                # Playwright end-to-end tests
```

---

## 3. Deep-Dive Module Analysis

### 3.1. How the OCCT Worker is Wired
- **Files**:
  - `src/core/io/OCCWorker.ts` (4,879 lines)
  - `src/core/io/OCCWorkerClient.ts` (207 lines)
  - `src/core/io/OpenCascadeService.ts` (366 lines)
- **Architecture**:
  - `OCCWorkerClient` spawns a standard Web Worker:
    ```ts
    this.worker = new Worker(new URL('./OCCWorker.ts', import.meta.url), { type: 'module' });
    ```
  - Communication is RPC message-passing using integer `messageId`, `resolvers` map, and `rejecters` map.
  - `OCCWorker.ts` uses the legacy `opencascade.js` (`^1.1.4`) package via `import { initOpenCascade } from "opencascade.js"`.
  - The worker maintains an in-memory `shapeCache = new Map<string, any>()` holding raw C++ pointers (`TopoDS_Shape`).
  - **No Hidden Line Removal (HLR)**: `OCCWorker.ts` does **not** implement orthographic HLR (`HLRBRep_Algo` or `projectEdges`). It is strictly oriented towards 3D boundary representation meshing: it tessellates shapes with `BRepMesh_IncrementalMesh` and returns triangle buffer arrays (`positions: Float32Array`, `indices: Uint32Array`, `faceMapping`, `edgeLines`) for Three.js rendering.
  - **Typing & Safety**: Extensive use of `any` (`let oc: any = null;`). Relies on manual `.delete()` pointer disposal, making it prone to memory leaks.

### 3.2. How Snaps Are Implemented
- **Files**:
  - `src/core/engine/SnapEngine.ts` (274 lines)
  - `src/core/engine/MathUtils.ts` (line 120-400)
  - `src/core/engine/Quadtree.ts` (spatial acceleration)
- **Snap Types Supported**:
  - `ENDPOINT`: Segment start/end, Arc endpoints, Polyline vertices, Spline control points, Point entities.
  - `MIDPOINT`: Line midpoints, Arc midpoints (evaluated at angular bisector $startAngle + \Delta\theta / 2$), Polyline straight and curved segment midpoints, Spline midpoint.
  - `CENTER`: Circle center, Arc center, Polyline arc segment centers, Donut center.
  - `INTERSECTION`: Pairwise geometric intersection computed between all nearby candidate entities via `getEntityEntityIntersections(e1, e2)`.
  - `PERPENDICULAR`: Requires `basePoint`: projects `basePoint` onto candidate line segments ($t \in [0, 1]$ parameter clamp) or radial vectors from circle/arc centers.
- **Query Strategy**:
  - Dual query approach:
    1. Linear scan with AABB bounding box pre-filter (`getSnapPoint`).
    2. Spatial query (`getSnapPointSpatial`) using `doc.querySpatialIndex(range)` (Quadtree). Pairwise intersections between nearby entities are tested first (high priority), followed by entity-specific snaps sorted by distance to cursor within `tolerance`.

### 3.3. How Commands Are Structured
- **Files**:
  - `src/core/commands/types.ts`
  - `src/core/engine/CommandManager.ts` (354 lines)
  - Individual commands in `src/core/commands/*.ts` (e.g., `LineCommand.ts`, `DimLinearCommand.ts`)
- **State Machine Architecture**:
  - Every command implements a `Command` interface:
    ```ts
    export interface Command {
      onPoint?(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse;
      onInput?(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined;
      getPreview?(x: number, y: number, units: UnitsConfig): Entity | PreviewObject | null;
      getPrompt?(): string;
      getReferencePoints?(): { x: number; y: number }[];
      getDynamicInput?(x: number, y: number, units: UnitsConfig): string[] | null;
    }
    ```
  - Commands maintain internal step state (e.g. `step = 0`, `points: Point[]`).
  - **Weaknesses**:
    - `CommandAction` in `types.ts` is an unwieldy catch-all type with over 90 optional properties.
    - Commands return heterogeneous response types (`string | Entity | CommandAction | void`), handled by large switch statements in `CommandManager` and `ActionHandler` classes.

### 3.4. How Dimensions Render
- **Files**:
  - `src/core/model/Dimension.ts` (130 lines)
  - `src/render/Viewer.ts` (lines 880-920, 1820-2050)
  - `src/core/plot/PlotSVGRenderer.ts` (lines 195-300)
- **Data Model**:
  - `Dimension` stores `type` (`'LINEAR' | 'ALIGNED' | 'ANGULAR' | 'RADIUS' | 'DIAMETER'`), definition points `(x1, y1)`, `(x2, y2)`, `offset`, `dimLineLocation`, and `style: DimStyle` (`textHeight`, `arrowSize`, `offset`, `gap`, `precision`, `DIMTOH`, `DIMTAD`).
- **Rendering Pipeline**:
  - **In Viewport (Three.js)**: Dimensions are converted into Three.js line segments and canvas-drawn texture sprites or vector text.
  - **In SVG Export (`PlotSVGRenderer`)**:
    - Decomposes dimension into SVG elements:
      - Dimension line: `<line x1=... y1=... x2=... y2=... />`
      - Extension lines: `<line>` connecting feature points to dimension line.
      - Arrowheads: Filled triangular polygons `<path d="M tip L left L right Z" fill="..."/>`.
      - Dimension text: `<text font-size="...mm" font-family="Arial" text-anchor="middle">...` positioned above or within a gap in the dimension line.

### 3.5. How PLOT to SVG/PDF Works
- **Files**:
  - `src/core/plot/PlotEngine.ts` (218 lines)
  - `src/core/plot/PlotSVGRenderer.ts` (692 lines)
  - `src/core/plot/TextToPath.ts` (185 lines)
  - `src/core/engine/handlers/PlotHandler.ts` (216 lines)
- **Pipeline Architecture**:
  1. **PlotEngine**:
     - Calculates plot viewport bounds (`WINDOW`, `DISPLAY`, or `EXTENTS`).
     - Computes paper scale factor (mm paper per drawing unit, e.g. Fit or 1:1) and centering offsets based on ISO paper sizes (`A0` through `A4`).
  2. **PlotSVGRenderer**:
     - Converts all 2D model entities (`Line`, `Arc`, `Circle`, `Polyline`, `Hatch`, `Dimension`, `Text`) to exact vector SVG `<svg viewBox="..." width="...mm" height="...mm">`.
     - Maps AutoCAD Color Index (ACI) to hex strokes.
  3. **TextToPath (`opentype.js`)**:
     - Crucial engineering feature: parses TrueType CAD fonts (`osifont.ttf`) using `opentype.js` and converts all `<text>` elements into vector glyph `<path>` strings.
     - **Result**: Output SVG is 100% font-independent and never suffers from missing font or glyph substitution issues.
  4. **PDF Generation (`jspdf` + `svg2pdf.js`)**:
     - `svgToPDF` initializes a `jsPDF` instance with exact millimeter sheet dimensions (`[pw, ph]`).
     - Uses `svg2pdf.js` to render the outlined SVG directly into the vector PDF stream.

### 3.6. Test Bridge Design
- **File**: `src/testing/TestBridge.ts` (1,078 lines)
- **Architecture**:
  - The WebCAD canvas is a single `<canvas>`. Standard Playwright pixel clicking is brittle.
  - `TestBridge` binds to `window.__webcadTest` when `import.meta.env.DEV` is true or when loaded with `?testBridge=1`.
  - Exposes semantic inspection and control:
    - Viewport & camera: `getCamera()`, `setCameraPreset('front')`, `screenPoint([x, y, z])`.
    - Document entities: `getObjects()`, `getObject(id)`.
    - Selection: `selectObject(id)`, `selectFace(solidId, faceIdx)`.
    - Snapping inspection: `getSnapPoint()`, `getActiveSnap()`.
    - Headless command execution: `executeCommand(cmd)`.
  - **Verdict**: Excellent architectural pattern for testing canvas CAD applications.

### 3.7. Code Quality
- **TypeScript Strictness**:
  - `tsconfig.json` has `"strict": true`, but `"noUncheckedIndexedAccess"` is omitted.
  - ESLint reports **904 warnings**, predominantly `@typescript-eslint/no-explicit-any`. Many internal functions bypass typing with `(entity as any)`.
- **Test Coverage**:
  - Unit test coverage of math, commands, parser, and solvers is comprehensive (332 passing tests).
  - Web Worker code is largely untyped and lacks isolated worker-thread unit testing.
- **Dead Code & Scope Creep**:
  - Contains extensive out-of-scope modules: CSG booleans, OpenSCAD AST/compiler/interpreter, WebGPU stub (`RendererBackend`), IndexedDB/RxDB/SQLite-WASM databases, parametric block browsers, and 3D gizmos.

---

## 4. Licences & Attribution Blockers

| Asset / File | Declared License | Origin / Details | Legal Implication for Our Project |
|---|---|---|---|
| **WebCAD Codebase** | MIT | `github.com/elhakimz/webcad` (README states MIT; root `package.json` missing explicit license key). | Permissive; clean attribution required in `THIRD_PARTY.md`. |
| **Icons** (`public/icons/black_blue/*.svg`) | **GPLv2** | LibreCAD project icons. | **BLOCKER FOR DIRECT INCLUSION**. LibreCAD icons are GPLv2. Copying them directly would trigger GPL copyleft obligations. **Do NOT reuse**. Use MIT/Apache icons (e.g. Lucide, Feather). |
| **Font: `osifont.ttf`** | **GPLv3 with Font Exception** | Created by Alexander Pruss / LibreCAD community. | Allowed for document rendering under Font Exception, but requires clear license text reproduction. Alternative: Use open SIL OFL fonts. |
| **Font: `helvetiker_regular`** | MIT / Bobistheowl | Three.js font asset. | Permissive. |
| **BOSL scripts** (`docs/scad/`) | BSD-2-Clause | Belfry OpenScad Library. | Out of scope (SCAD is a non-goal). |

---

## 5. Module-by-Module Verdicts

| Module & File Paths | Verdict | Detailed Reason |
|---|---|---|
| **Snap Engine**<br>`src/core/engine/SnapEngine.ts`<br>`src/core/engine/MathUtils.ts` | **REUSE WITH REWRITE** | The geometric snap math (endpoint, midpoint, circle/arc center, segment projection for perpendicular, and arc bisector) is solid. However, it must be rewritten into strict TypeScript (`noUncheckedIndexedAccess`, no `any`), decoupled from Three.js vectors, and backed by comprehensive unit tests in `src/draft`. |
| **Command State Machine**<br>`src/core/commands/types.ts`<br>`src/core/engine/CommandManager.ts`<br>`src/core/commands/LineCommand.ts` | **IDEA ONLY** | The concept of step-based commands with `onPoint`, `onInput`, `getPreview`, and prompt feedback is standard CAD architecture. However, WebCAD's 95-property untyped `CommandAction` union object is bloated and messy. We will build a strongly typed, discriminated union command state machine in `src/draft`. |
| **Dimension Formatting & Geometry**<br>`src/core/model/Dimension.ts`<br>`src/core/plot/PlotSVGRenderer.ts` | **REUSE WITH REWRITE** | The calculation of dimension extension lines, offset dimension lines, and triangular arrowheads is mathematically clean and ISO-compliant. Must be decoupled from AutoCAD DXF conventions and implemented with strict typing in `src/draft` and `src/sheet`. |
| **SVG & PDF Plot Pipeline**<br>`src/core/plot/PlotEngine.ts`<br>`src/core/plot/PlotSVGRenderer.ts`<br>`src/core/plot/TextToPath.ts` | **REUSE WITH REWRITE** | The `PlotEngine` viewport scaling/centering math and `TextToPath` (`opentype.js`) vector font outlining before `svg2pdf.js` export is an outstanding, battle-tested approach that guarantees font-independent vector PDFs. We will adapt this for our ISO A2 sheet exporter in `src/sheet`. |
| **Test Bridge**<br>`src/testing/TestBridge.ts` | **IDEA ONLY** | The pattern of exposing an in-app semantic test bridge on `window.__canvasTest` for e2e test automation (without pixel-matching) is brilliant. We will adopt this architecture in `testing/` for grading and canvas tests. |
| **OCCT Worker**<br>`src/core/io/OCCWorker.ts`<br>`src/core/io/OCCWorkerClient.ts` | **SKIP** | WebCAD uses stale `opencascade.js@1.1.4` (65.8 MB WASM), has zero HLR capability, is 4,879 lines of untyped manual C++ bindings, and produces 3D triangle meshes rather than 2D orthographic edge projections. We use `occt-wasm` with native `HLRBRep` in `src/kernel`. |
| **LibreCAD Icons**<br>`public/icons/black_blue/*.svg` | **SKIP** | **GPLv2 license blocker**. We will use permissive MIT/Apache icons instead. |
| **SCAD & Constraint Solvers**<br>`src/scad/*`<br>`src/core/sketcher/*` | **SKIP** | Explicit non-goal (see `SPEC.md`). We are an educational orthographic projection tool, not an OpenSCAD compiler or variational constraint solver. |
