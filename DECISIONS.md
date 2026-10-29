# Architectural & Design Decisions

This document records the architectural decisions made in the Engineering Graphics platform, following an ADR (Architecture Decision Record) structure.

---

## ADR 001: Use Open CASCADE Technology (OCCT) Hidden Line Removal (HLR) Pipeline

### Context
In orthographic projection of 3D solids (prisms, pyramids, cylinders, cones, and composite solids), determining visible outlines versus hidden lines (which must be drawn as dashed lines according to engineering drawing standards) is a non-trivial boundary representation (B-Rep) hidden line removal problem. Naive raycasting, polygon clipping, or depth-buffer screen-space techniques produce approximations with pixel artifacts, lack topological continuity, and fail to distinguish silhouette curves and true outline edges cleanly.

### Decision
Use Open CASCADE Technology (OCCT) via WebAssembly worker (`src/kernel`) for solid modelling and exact topological Hidden Line Removal (`HLRBRep_Algo` / `HLRBRep_HLRToShape`).

### Consequences
- **Pros**:
  - Exact analytic 2D curve and segment outputs (lines, arcs, elliptical curves) suitable for high-precision CAD drafting and grading.
  - Native differentiation between visible sharp edges, hidden edges, smooth silhouettes, and outline boundaries.
  - Robust handling of complex solid intersections and inclined projection planes.
- **Cons**:
  - Requires managing a WebAssembly runtime and asynchronous worker boundary.
  - Solid creation and HLR computation must be strictly decoupled from UI rendering.

---

## ADR 002: Server-Side Grading Architecture

### Context
Automated evaluation requires comparing student 2D drafted segments against canonical ground-truth solutions. If canonical models or solution coordinates are included in client-side bundles, students can inspect JavaScript heap state or network payloads to extract exact solution coordinates, defeating the educational grading purpose.

### Decision
Perform final grading and canonical tolerance evaluation on the server (`server/`). The client submits the student's normalized 2D drawing entities (points, segments, dimensions, line classifications), and the backend runs the geometric checker against server-held problem seeds and canonical states.

### Consequences
- **Pros**:
  - Complete security against client-side tampering, inspection, and reverse engineering of ground-truth solutions.
  - Centralized audit trails and tamper-proof grading logs for instructors.
- **Cons**:
  - Requires backend infrastructure and grading API endpoints.
  - Client-side real-time interactive hints must rely on localized feedback heuristics or secure intermediate verification tokens without exposing the full solution.

---

## ADR 003: First-Angle Projection Standard

### Context
Engineering drawing curricula globally adhere to either First-Angle Projection (standard in ISO countries, India / BIS, UK / BS, Europe / DIN) or Third-Angle Projection (standard in US / ANSI, Canada). First-angle projection requires placing the object between the observer and the plane of projection (Quadrant 1), resulting in:
- Front View on the Vertical Plane (VP) above the reference line XY.
- Top View on the Horizontal Plane (HP) folded down below the reference line XY.
- Left-hand side view positioned to the right of the front view.

### Decision
Standardise the platform primarily on First-Angle Orthographic Projection as mandated by ISO 5456-2 and BIS SP 46 standards for engineering education.

### Consequences
- **Pros**:
  - Aligns with university and technical college engineering graphics syllabi across India, Europe, and ISO-standard institutions.
  - Provides a single, unambiguous mathematical coordinate and fold-out convention throughout the core modules.
- **Cons**:
  - Third-angle projection support (if requested later) must be implemented via explicit transformation adapters rather than being assumed as the default.

---

## ADR 004: Strict TypeScript Configuration

### Context
CAD algorithms, 3D coordinate transformations, and geometric tolerance verifiers involve deep numeric structures, vector arrays, and nullable topological queries. Unchecked index lookups or weak typing inevitably introduce silent runtime failures (e.g., `NaN`, `undefined` coordinate bugs, accidental type coercion).

### Decision
Enforce strict TypeScript compiler rules across the entire repository:
- `"strict": true`
- `"noUncheckedIndexedAccess": true`
- `"noImplicitOverride": true`
- Prohibition of untyped `any` without strict wrapper boundaries.

### Consequences
- **Pros**:
  - Compile-time guarantees for array index lookups (forcing explicit bounds checks on geometric vertices and segment collections).
  - High confidence in refactoring mathematical transformation pipelines.
  - Early detection of edge cases and missing properties in geometry objects.
- **Cons**:
  - Requires more defensive code and explicit type guard utilities when indexing arrays and parsing geometry packets.
