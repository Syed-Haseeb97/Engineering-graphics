# Kernel

## Purpose
Core geometric modelling and projection extraction module:
- OCCT (Open CASCADE Technology) WebAssembly worker orchestration
- Parametric 3D solid and shape builders (prisms, pyramids, cylinders, cones, spheres, frustums, composite solids)
- Hidden Line Removal (HLR) pipeline wrapper
- 2D edge extraction and classification (visible outlines, hidden edges, centerlines, fold lines)

## Boundary Rules
> **STRICT CONSTRAINT**: NO UI imports allowed in this module. All computations must run headless and be worker-compatible.
