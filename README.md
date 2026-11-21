# Engineering Graphics & Orthographic Projection Platform

An interactive, browser-based engineering graphics platform for first-angle orthographic projection, CAD exercises, and automated geometric checking.

## Overview

- **3D Solid Modeling & Visualization**: OpenCASCADE WASM (`occt-wasm`) and Three.js for interactive model inspection, cross-sections, and projection alignment.
- **2D Drafting Canvas**: Multi-tool drafting surface supporting construction lines, projection lines, dimensioning, and standard drafting conventions.
- **Automated Geometry Checker**: Robust alignment and matching algorithms to automatically verify student orthographic submissions against ground-truth solids.
- **Instructor Dashboard**: Question authoring, class progress monitoring, and automated grading reports.

## Getting Started

### Prerequisites

- Node.js (v18+ or v20+)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Testing & Verification

```bash
npm run test          # Unit and component tests via Vitest
npm run test:oracle   # Solid geometry oracle tests
npm run test:e2e      # End-to-end integration tests via Playwright
npm run typecheck     # TypeScript compiler check
```

## Architecture

- `src/draft/` - 2D drafting canvas, snapping engine, and command history
- `src/viewer/` - Three.js 3D solid viewer and camera projection controller
- `src/checker/` - Entity normalization, contour matching, and hint generation
- `server/` - Instructor endpoints, OCCT worker thread pool, and grading services
- `docs/` - System architecture, decisions, performance metrics, and textbook guides

## License

ISC
