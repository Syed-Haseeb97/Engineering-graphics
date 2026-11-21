# Engineering Graphics Platform — Manual Bug Bash Checklist

This checklist contains **42 comprehensive manual testing scenarios** spanning all operational facets of the Engineering Graphics first-angle orthographic projection platform. Each scenario details the category, initial preconditions, step-by-step reproduction instructions, expected verification criteria, and quality status.

---

## Group 1: 2D Canvas Drafting, Snapping & Precision Geometry (Scenarios 01 – 10)

### BB-01: Endpoint Object Snapping on Segment Extremities
- **Category**: Canvas & Snapping
- **Preconditions**: Student drafting canvas open, straight line tool active.
- **Action Steps**:
  1. Click at `(20, 20)` and `(80, 20)` to draft horizontal segment `AB`.
  2. Select straight line tool again. Move mouse pointer within 12 px radius of point `B` `(80, 20)`.
  3. Observe snap indicator marker and hover tooltip.
  4. Click once and draw to `(80, 80)`.
- **Expected Result**: Green square endpoint snap indicator appears at `(80, 20)`. The second line starts exactly at `(80, 20)` without visual gaps or coordinate rounding errors.
- **Status**: [x] Passed

### BB-02: Midpoint Snapping on Linear Segments
- **Category**: Canvas & Snapping
- **Preconditions**: Existing horizontal line from `(10, 30)` to `(90, 30)`.
- **Action Steps**:
  1. Select line tool.
  2. Hover cursor near the center `(50, 30)` of the segment.
  3. Observe cyan triangle snap indicator.
  4. Click and draw vertical projector downwards to `(50, -30)`.
- **Expected Result**: Cyan midpoint indicator snaps cursor precisely to world coordinate `(50, 30)`.
- **Status**: [x] Passed

### BB-03: Center Snapping on Circles and Circular Arcs
- **Category**: Canvas & Snapping
- **Preconditions**: Circle drafted with center `(60, 40)` and radius 25 mm.
- **Action Steps**:
  1. Hover near the circumference or center point of the circle.
  2. Observe orange circle snap indicator with dot.
  3. Click to start a new line at the detected center.
- **Expected Result**: Cursor locks onto exact circle center `(60, 40)`.
- **Status**: [x] Passed

### BB-04: Intersection Snapping on Crossing Lines
- **Category**: Canvas & Snapping
- **Preconditions**: Line 1 drawn from `(10, 10)` to `(50, 50)`, Line 2 from `(10, 50)` to `(50, 10)`.
- **Action Steps**:
  1. Hover over the crossing point `(30, 30)`.
  2. Observe amber 'X' intersection indicator.
  3. Click to start an arc from the intersection.
- **Expected Result**: Intersection point calculated cleanly at `(30, 30)`; arc start snaps to `(30, 30)`.
- **Status**: [x] Passed

### BB-05: Perpendicular Snapping from External Point to Line
- **Category**: Canvas & Snapping
- **Preconditions**: Inclined line drawn from `(0, 0)` to `(100, 50)`.
- **Action Steps**:
  1. Start line from external point `(20, 80)`.
  2. Hover cursor over the inclined line.
  3. Observe purple right-angle perpendicular snap glyph.
  4. Click to complete line.
- **Expected Result**: Point drops perpendicularly onto the line along the mathematical normal. Dot product of vectors equals 0.
- **Status**: [x] Passed

### BB-06: Ortho Mode (F8) Horizontal and Vertical Locking
- **Category**: Canvas & Snapping
- **Preconditions**: Line tool active. Click start point at `(30, 30)`.
- **Action Steps**:
  1. Press `F8` or click the "Ortho: OFF" button in the control palette.
  2. Move cursor diagonally towards `(75, 42)`.
  3. Move cursor vertically towards `(35, 95)`.
- **Expected Result**: Button toggles to "Ortho: ON" with `aria-pressed="true"`. Cursor is constrained strictly to $0^\circ, 90^\circ, 180^\circ,$ or $270^\circ$. Preview snaps to $(75, 30)$ when $\Delta X > \Delta Y$, and to $(30, 95)$ when $\Delta Y > \Delta X$.
- **Status**: [x] Passed

### BB-07: Canvas Pan via Middle-Mouse or Spacebar Drag
- **Category**: Canvas Viewport
- **Preconditions**: Canvas with drafted entities.
- **Action Steps**:
  1. Press and hold middle mouse button (wheel) and drag.
  2. Alternatively, hold Spacebar and drag with left mouse button.
- **Expected Result**: Viewport pans smoothly without drafting accidental entities. Entities and XY line stay rigidly synchronized.
- **Status**: [x] Passed

### BB-08: Canvas Zoom via Wheel Centered on Cursor
- **Category**: Canvas Viewport
- **Preconditions**: Canvas viewport open.
- **Action Steps**:
  1. Place mouse cursor over specific entity corner at `(40, 50)`.
  2. Scroll mouse wheel up (zoom in) and down (zoom out).
- **Expected Result**: Viewport zooms smoothly between zoom limits (0.2x to 10.0x). The world point under the cursor remains invariant under zoom.
- **Status**: [x] Passed

### BB-09: Window Resize and High-DPI Retina Handling
- **Category**: Canvas Viewport
- **Preconditions**: Browser window at 1280x800.
- **Action Steps**:
  1. Resize browser window to tablet width (768px) and split-screen mode.
  2. Drag window between standard 1x display and 2x High-DPI display.
- **Expected Result**: Canvas internal resolution scales with `window.devicePixelRatio`. Line rendering remains razor sharp without blurring or clipping.
- **Status**: [x] Passed

### BB-10: Entity Erase Tool Click and Boundary Box Drag
- **Category**: Canvas Drafting
- **Preconditions**: 5 distinct entities drawn on canvas.
- **Action Steps**:
  1. Select Erase tool (`E` shortcut).
  2. Click single line entity to delete.
  3. Drag an area selection box over two remaining entities.
- **Expected Result**: Targeted entity is highlighted red upon hover and removed upon click. Area drag erases all contained entities in one atomic command.
- **Status**: [x] Passed

---

## Group 2: Command State Machines, Text Input & Shortcuts (Scenarios 11 – 18)

### BB-11: Command Bar Absolute Coordinate Entry
- **Category**: Command Bar
- **Preconditions**: Line tool active. Prompt reads "Click to specify start point".
- **Action Steps**:
  1. Focus command input bar at bottom.
  2. Type `25,40` and press Enter.
  3. Type `85,40` and press Enter.
  4. Press Escape.
- **Expected Result**: Line segment created precisely from $(25, 40)$ to $(85, 40)$ without touching mouse.
- **Status**: [x] Passed

### BB-12: Command Bar Relative Polar Entry (`@length<angle`)
- **Category**: Command Bar
- **Preconditions**: Line tool active with start point at `(50, 50)`.
- **Action Steps**:
  1. Type `@60<45` into command input bar and press Enter.
- **Expected Result**: End point created at $(50 + 60\cos 45^\circ, 50 + 60\sin 45^\circ) = (92.43, 92.43)$.
- **Status**: [x] Passed

### BB-13: Keyboard Single-Key Tool Switching
- **Category**: Shortcuts & A11y
- **Preconditions**: Problem workspace active.
- **Action Steps**:
  1. Press `L` (Line).
  2. Press `C` (Circle C-R).
  3. Press `A` (Arc 3-Point).
  4. Press `P` (Vertical Projector).
  5. Press `D` (Linear Dimension).
  6. Press `E` (Erase).
- **Expected Result**: Active tool switches immediately without mouse intervention. Corresponding toolbar button updates `active` class and `aria-pressed="true"`.
- **Status**: [x] Passed

### BB-14: Multi-Step Undo and Redo State Stack
- **Category**: History & State
- **Preconditions**: Canvas with 0 entities.
- **Action Steps**:
  1. Draw Line 1, Line 2, Circle 1, Arc 1 (4 actions).
  2. Press `Ctrl+Z` three times.
  3. Press `Ctrl+Y` two times.
- **Expected Result**: After 3 undos, only Line 1 remains. After 2 redos, Line 1, Line 2, and Circle 1 are restored. State stack and entity counter remain exact.
- **Status**: [x] Passed

### BB-15: Circle 2-Point Diameter Mode
- **Category**: Drafting Geometry
- **Preconditions**: "Circle (2-Pt)" tool active.
- **Action Steps**:
  1. Click point 1 at `(20, 20)`.
  2. Move cursor to `(60, 20)` and click point 2.
- **Expected Result**: Circle created with center `(40, 20)` and diameter 40 mm (radius 20 mm).
- **Status**: [x] Passed

### BB-16: Arc 3-Point Circumferential Creation
- **Category**: Drafting Geometry
- **Preconditions**: "Arc (3-Pt)" tool active.
- **Action Steps**:
  1. Click start point `(0, 50)`.
  2. Click mid arc point `(25, 75)`.
  3. Click end point `(50, 50)`.
- **Expected Result**: Circular arc constructed passing exactly through all 3 points with center $(25, 50)$ and radius 25 mm.
- **Status**: [x] Passed

### BB-17: Escape Key State Machine Cancellation
- **Category**: State Machine
- **Preconditions**: Arc tool or Polyline tool active mid-construction (1 or 2 points placed).
- **Action Steps**:
  1. Place point 1.
  2. Press `Escape` key before placing point 2.
- **Expected Result**: In-progress preview entity is cleared. Command prompt returns to "Click to specify start point" or idle. No phantom entity added.
- **Status**: [x] Passed

### BB-18: Linear Dimension Tool with Auto-Text Placement
- **Category**: Drafting Annotation
- **Preconditions**: Segment from `(20, 30)` to `(80, 30)` (length 60 mm).
- **Action Steps**:
  1. Select Dimension tool (`D`).
  2. Click `(20, 30)`, click `(80, 30)`.
  3. Move offset cursor 15 mm above segment to `(50, 45)` and click.
- **Expected Result**: Dimension entity created with witness lines, dimension line with arrowheads, and centered text reading "60".
- **Status**: [x] Passed

---

## Group 3: Projection Geometry & First-Angle Rules (Scenarios 19 – 26)

### BB-19: First-Angle Projection Quadrant Placement
- **Category**: Engineering Graphics Standards
- **Preconditions**: Problem statement requires Front Elevation and Top Plan.
- **Action Steps**:
  1. Inspect student drawing with Front View drawn above the XY reference line ($Y > 0$).
  2. Inspect Top View drawn below the XY reference line ($Y < 0$).
- **Expected Result**: First-angle projection convention verified: Elevation is strictly above XY, Plan is strictly below XY.
- **Status**: [x] Passed

### BB-20: Vertical Projector Alignment between Front and Top Views
- **Category**: Orthographic Rules
- **Preconditions**: Front view of a square prism drawn between $X = 30$ and $X = 70$.
- **Action Steps**:
  1. Draw top view with left edge at $X = 30$ and right edge at $X = 70$.
  2. Connect corresponding corners with thin continuous projector lines.
  3. Run checker inspection.
- **Expected Result**: Projector alignment metric reports 100% agreement. No misalignment penalty.
- **Status**: [x] Passed

### BB-21: Projector Misalignment Detection
- **Category**: Auto-Checker & Feedback
- **Preconditions**: Front view drawn at $X \in [30, 70]$. Top view mistakenly drawn at $X \in [45, 85]$ (15 mm offset).
- **Action Steps**:
  1. Click "Check My Work".
- **Expected Result**: Checker flags `projector_misalignment`. Hint explains: "Projectors between the front and top view are not aligned. In first-angle projection, corresponding points must share vertical projectors."
- **Status**: [x] Passed

### BB-22: Visible vs Hidden Line Type Differentiation
- **Category**: Line Standards (IS 128)
- **Preconditions**: Pyramid or cone with internal obscured edges.
- **Action Steps**:
  1. Draw visible silhouette with Continuous Thick line (`#0f172a`, 2.2px).
  2. Draw rear obscured edge with Dashed Hidden line (`#334155`, 1.4px, dash 6px, gap 4px).
  3. Check drawing.
- **Expected Result**: Line style rubric awards full marks. Canvas visibly differentiates continuous outlines and dashed edges.
- **Status**: [x] Passed

### BB-23: Inverted Line Type Detection (Hidden drawn as Visible)
- **Category**: Auto-Checker
- **Preconditions**: A hidden rear edge is drawn using Continuous style instead of Dashed style.
- **Action Steps**:
  1. Run "Check My Work".
- **Expected Result**: Line Type metric drops. Evaluated edge highlights with purple (`wrongType`). Hint states: "An edge in the top view is drawn with the wrong line type."
- **Status**: [x] Passed

### BB-24: Axis / Center Line Representation
- **Category**: Line Standards
- **Preconditions**: Cylinder or cone axis projection.
- **Action Steps**:
  1. Select Centre line style (`#b91c1c`, dash pattern 14-4-3-4).
  2. Draw axis extending 3–5 mm beyond the solid boundaries.
- **Expected Result**: Long-dash-dot-long-dash stroke renders correctly in canvas and vector exports.
- **Status**: [x] Passed

### BB-25: Missing XY Reference Line Error Handling
- **Category**: Auto-Checker Validation
- **Preconditions**: Student deletes the default XY reference line entity.
- **Action Steps**:
  1. Click "Check My Work".
- **Expected Result**: Checker returns typed error `MISSING_XY_LINE`. User alert explains: "Your drawing is missing the horizontal reference line XY. Technical drawings require XY at Y = 0 to establish ground planes."
- **Status**: [x] Passed

### BB-26: Non-Horizontal XY Reference Line Error Handling
- **Category**: Auto-Checker Validation
- **Preconditions**: Student rotates or modifies XY line to be inclined at $15^\circ$.
- **Action Steps**:
  1. Click "Check My Work".
- **Expected Result**: Checker returns `INVALID_XY_LINE` error: "The reference line XY must be strictly horizontal along the X-axis."
- **Status**: [x] Passed

---

## Group 4: Auto-Checker, Rubrics & Progressive Hints (Scenarios 27 – 32)

### BB-27: Ground Truth Coordinate Masking
- **Category**: Security & Cheating Prevention
- **Preconditions**: Student opens inspection preview drawer.
- **Action Steps**:
  1. Inspect network payload of `POST /attempts/:id/check`.
  2. Inspect DOM content and console logs.
- **Expected Result**: Response contains ONLY score, metrics, hint templates, and relative defect bounding boxes. Zero CAD B-Rep ground truth entities or absolute coordinate arrays are transmitted to the client.
- **Status**: [x] Passed

### BB-28: Progressive Hint Unlocking (Level 1 $\rightarrow$ Level 2 $\rightarrow$ Level 3)
- **Category**: Hint System
- **Preconditions**: Drawing contains 1 missing hidden edge.
- **Action Steps**:
  1. Open feedback drawer. Observe Level 1 hint: "Check for missing internal details in the front view."
  2. Click "Unlock Next Hint Level".
  3. Click "Unlock Next Hint Level" again.
- **Expected Result**: Level 2 reveals "A hidden edge is missing in the front view." Level 3 reveals technical principle "Edges obscured by solid material must be drawn as dashed lines." Button updates to "All Hint Levels Unlocked" and disables.
- **Status**: [x] Passed

### BB-29: Repeated Defect Hint Deduplication
- **Category**: Hint System
- **Preconditions**: Student leaves out 6 hidden edges in the top view of a hexagonal prism.
- **Action Steps**:
  1. Click "Check My Work".
- **Expected Result**: Drawer displays a single aggregated hint card for `missing_top_hidden` with badge "6 instances", avoiding notification flooding.
- **Status**: [x] Passed

### BB-30: In-Memory Ground Truth Server Caching
- **Category**: Performance & Server
- **Preconditions**: Server running with seed caching enabled.
- **Action Steps**:
  1. Student requests check 1 (cache miss: kernel builds B-Rep and HLR).
  2. Student requests checks 2 through 5 without modifying problem seed.
- **Expected Result**: Check 1 completes in ~75 ms. Checks 2–5 hit in-memory cache and complete in $< 5\text{ ms}$, ensuring 0% load under concurrency.
- **Status**: [x] Passed

### BB-31: Rate Limiting on Check Endpoint
- **Category**: Server Safety
- **Preconditions**: Student rapid-clicks "Check My Work" 10 times in 2 seconds.
- **Action Steps**:
  1. Trigger bursts of check requests.
- **Expected Result**: Excess requests receive HTTP 429 Too Many Requests with retry-after header, protecting server worker pool from denial-of-service.
- **Status**: [x] Passed

### BB-32: Shift Invariant Alignment Tolerance
- **Category**: Auto-Checker Geometry
- **Preconditions**: Complete correct student drawing translated $+50\text{ mm}$ X and $+25\text{ mm}$ Y along with the XY line.
- **Action Steps**:
  1. Run checker inspection.
- **Expected Result**: Score remains 100%. Checker's alignment stage normalizes origin relative to student's XY reference marker without penalizing sheet positioning.
- **Status**: [x] Passed

---

## Group 5: Student & Instructor Workflows, Autosave & Overrides (Scenarios 33 – 37)

### BB-33: IndexedDB Offline Autosave and Crash Recovery
- **Category**: Data Persistence
- **Preconditions**: Student drafts 10 entities.
- **Action Steps**:
  1. Disconnect Wi-Fi (toggle browser offline mode).
  2. Force-refresh browser tab (`Ctrl+F5`).
- **Expected Result**: Connection badge switches to "Offline (Draft Saved Locally)". Canvas restores all 10 drafted entities from IndexedDB upon page reload.
- **Status**: [x] Passed

### BB-34: Final Submission Idempotency and Locking
- **Category**: Exam Workflow
- **Preconditions**: Student completes drawing and confirms submit in modal dialog.
- **Action Steps**:
  1. Click "Confirm & Final Submit".
  2. Attempt to draw additional entities or click submit button again.
- **Expected Result**: Attempt status locks to `submitted`. Subsequent submission calls return identical submission ID without recreating database records.
- **Status**: [x] Passed

### BB-35: 3D Reference Viewer Post-Submission Access Control
- **Category**: Security Policy
- **Preconditions**: Active drawing in progress.
- **Action Steps**:
  1. Attempt to view 3D solid model before submission.
  2. Submit drawing and observe result screen.
- **Expected Result**: 3D viewer is strictly inaccessible during drafting. Only after successful final submission is the read-only WebGL 3D reference viewer unlocked on the scorecard.
- **Status**: [x] Passed

### BB-36: Instructor Submission Review & Overlay Inspection
- **Category**: Instructor Portal
- **Preconditions**: Instructor dashboard open.
- **Action Steps**:
  1. Select student submission row from table.
  2. Modal opens with Canvas2D overlay of student drawing vs canonical truth.
- **Expected Result**: Student lines render in black, matched in green, missing in dashed red, extra in amber, and wrong line type in purple. Telemetry shows time spent and hint counts.
- **Status**: [x] Passed

### BB-37: Mandatory Comment Requirement for Score Overrides
- **Category**: Audit & Governance
- **Preconditions**: Review modal open.
- **Action Steps**:
  1. Change score from 75 to 88.
  2. Leave reason/comment input empty and click "Save Score Override".
  3. Enter comment "Awarding partial credit for auxiliary projection" and submit.
- **Expected Result**: Empty comment displays error: "A mandatory comment is required for faculty grade overrides." Filled comment succeeds and creates an immutable row in `audit_log`.
- **Status**: [x] Passed

---

## Group 6: Sheet Layout, Vector Plotting & Hybrid Paper Assessment (Scenarios 38 – 42)

### BB-38: Standard ISO A2 Sheet Border & Margin Constraints
- **Category**: Sheet & Plotting
- **Preconditions**: Drawing layout generated.
- **Action Steps**:
  1. Inspect sheet dimensions and border margins.
- **Expected Result**: Outer sheet measures exactly $594 \times 420\text{ mm}$. Untrimmed margin is $20\text{ mm}$ on binding left edge and $10\text{ mm}$ on top, right, and bottom edges.
- **Status**: [x] Passed

### BB-39: ISO 7200 Title Block Field Verification
- **Category**: Sheet & Plotting
- **Preconditions**: Title block placed at lower right corner $(584, 10)\text{ mm}$.
- **Action Steps**:
  1. Check metadata fields in title block.
- **Expected Result**: Name, Roll Number, Section, Sheet Title, Problem ID, Date, Scale (1:1), and First-Angle Projection symbol (truncated cone symbol) are crisp and legible.
- **Status**: [x] Passed

### BB-40: Pure Vector SVG Export Quality
- **Category**: Vector Export
- **Preconditions**: Completed drawing with mixed line styles.
- **Action Steps**:
  1. Generate SVG export. Inspect XML source.
- **Expected Result**: SVG contains clean `<line>`, `<circle>`, `<path>`, and `<text>` elements. Zero raster/base64 bitmap embeddings. Correct stroke widths ($0.7\text{ mm}, 0.35\text{ mm}, 0.25\text{ mm}$) and dash arrays.
- **Status**: [x] Passed

### BB-41: 1:1 Vector PDF Export & Page Geometry
- **Category**: Vector Export
- **Preconditions**: Completed drawing exported as PDF.
- **Action Steps**:
  1. Open generated PDF in Adobe Acrobat or PDF viewer.
  2. Check Document Properties $\rightarrow$ Page Size.
- **Expected Result**: Page size is exactly $1683.78 \times 1190.55\text{ pt}$ ($594 \times 420\text{ mm}$ A2). Scale is 1:1. Lines print with true vector crispness.
- **Status**: [x] Passed

### BB-42: Hybrid Assessment "Print to Paper" Mode
- **Category**: Hybrid Classroom Mode
- **Preconditions**: Instructor generates paper worksheet for offline drafting hall exam.
- **Action Steps**:
  1. Select problem template and click "Generate Paper Worksheet".
- **Expected Result**: Layout outputs A2 sheet with standard border and title block, with the seeded problem statement formatted above the title block, and a blank drawing canvas area for pencil drafting.
- **Status**: [x] Passed
