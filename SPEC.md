# Engineering Graphics Platform Specification

## 1. Project Overview & Scope (v1)
A specialised browser-based Engineering Graphics education and automated grading platform focused on First-Angle Orthographic Projection according to standard technical drawing conventions (ISO / BIS).

### Core Features (v1)
- **First-Angle Projection Topics**:
  - Projection of Points (across Quadrant 1, relative to HP and VP).
  - Projection of Straight Lines (parallel, perpendicular, and inclined to one or both reference planes; true lengths, apparent lengths, inclinations $\theta$ and $\phi$, traces).
  - Projection of Planes (polygonal and circular laminae inclined to reference planes).
  - Projection of Solids (prisms, pyramids, cylinders, cones, frustums, composite solids) including auxiliary planes and solids with inclined axes.
- **Multiview Orthographic Projections**:
  - Front View (Elevation) on the Vertical Plane (VP).
  - Top View (Plan) on the Horizontal Plane (HP).
  - Side Views (Left-Hand and Right-Hand End Elevations) on Profile Planes (PP).
- **Interactive Precision 2D Drafting**:
  - In-browser drafting canvas with magnetic geometric snaps (endpoints, midpoints, intersections, tangents, perpendiculars).
  - Engineering line types (continuous thick outlines, dashed hidden details, long-short dashed centerlines, thin continuous projection and dimension lines).
  - Dimensioning tools conforming to ISO standards.
- **Automated Grading Engine**:
  - Server-side geometric tolerance and topology matcher.
  - Sub-millimetre precision evaluation and line classification verification.
  - Granular pedagogical feedback detailing mistakes, missing projections, and hints.
- **Drawing Sheet & Export**:
  - ISO A2 landscape sheet layout (594 mm × 420 mm) with standard margins and borders.
  - Engineering title block with First-Angle Projection symbol (conical frustum), student metadata, scale 1:1, and tolerances.
  - High-fidelity vector SVG and PDF plot export.
- **Instructor Dashboard**:
  - Problem bank and parametric assignment generator.
  - Cohort analytics, grading breakdown, submission inspection, and rubric overrides.

---

## 2. Non-Goals
This platform is deliberately **NOT** a general CAD package. Explicit non-goals include:
- **General 3D CAD Modelling**: No freeform surface sculpting, CSG boolean tree editing UI, direct manipulation gizmos, or arbitrary solid modelling by students.
- **Assembly Modelling & Kinematics**: No multi-part mating, joints, mechanisms, or kinematic simulation.
- **Finite Element Analysis (FEA) & Simulation**: No structural, thermal, CFD, or stress analysis.
- **Parametric Geometric Constraint Solver UI**: No 2D variational constraint solving interface (e.g., solving simultaneous non-linear equation systems with degrees-of-freedom UI like FreeCAD or SolidWorks sketcher).
- **Full DXF/DWG Interoperability**: No complete AutoCAD DWG/DXF feature-parity, layer tables, paper-space viewports, or arbitrary CAD block importing.

---

## 3. Coordinate Convention & Projection Maths

### World Coordinate System (Right-Handed Standard)
- **X-axis**: Horizontal, pointing to the right ($+X$ rightward).
- **Y-axis**: Distance in front of the Vertical Plane (VP) towards the viewer ($+Y$ forwards / in front of VP).
- **Z-axis**: Vertical elevation, height above the Horizontal Plane (HP) ($+Z$ upward).
- **Reference Ground Planes**:
  - **Horizontal Plane (HP)**: $Z = 0$.
  - **Vertical Plane (VP)**: $Y = 0$.
  - **Reference Line (XY)**: Intersection of HP and VP where $Y = 0$ and $Z = 0$.

### First-Angle Quadrant Placement (Quadrant 1)
- The object lies in the first quadrant:
  - Height above HP: $Z > 0$
  - Distance in front of VP: $Y > 0$

### Multiview Unfolding / Fold-Out Rules
1. **Front View (Elevation)**:
   - Observed along the $+Y$ viewing direction looking directly onto the VP.
   - Coordinates projected onto VP: $(X, Z)$.
   - Position on sheet: Sits above reference line XY.
2. **Top View (Plan)**:
   - Observed downwards from above along the $-Z$ viewing direction onto the HP.
   - Initial coordinates on HP: $(X, Y)$.
   - Orthographic Fold-Out Convention: The Horizontal Plane (HP) is rotated downwards by 90° about reference line XY.
   - Folded sheet coordinates: Sits **below** the reference line XY at $(X, -Y)$.
3. **Side View (Profile / End Elevation)**:
   - Profile Plane (PP) is perpendicular to both HP and VP ($X_1Y_1$ line).
   - In First-Angle Projection:
     - The **Left-Hand Side View (LHSV)** is projected from the left and drawn on the profile plane to the **right** of the front view.
     - The **Right-Hand Side View (RHSV)** is projected from the right and drawn on the profile plane to the **left** of the front view.
   - Side view coordinates are derived from $(Y, Z)$ with the first-angle mirroring/offset rule strictly derived and unit-tested in `src/projection`.

---

## 4. Units & Precision
- **Units**: **Millimetres (mm) always** across all calculations, schemas, database entities, and drawing outputs.
- **Angles**: Decimal degrees (converted to radians internally where mathematical functions require, with explicit conversion utilities).
- **Tolerances**: Configurable default tolerances for auto-grading (e.g., positional tolerance $\le 0.5\text{ mm}$, angular tolerance $\le 1^\circ$).
