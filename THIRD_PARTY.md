# Third-Party Components & Licenses

All third-party code, libraries, WebAssembly binaries, fonts, shaders, or algorithms integrated directly into the repository must be catalogued in the table below.

| Component | Licence | How Used | Files |
|-----------|---------|----------|-------|
| `occt-wasm@5.8.1` | MIT OR Apache-2.0 | OpenCASCADE B-Rep geometric kernel compiled to WebAssembly (solid builders, transformations, HLR edge extraction) | `node_modules/occt-wasm` |
| `three@0.186.1` | MIT | 3D WebGL renderer and OrbitControls for interactive 3D spatial inspector in student teaching viewer | `src/ui/viewer/` |
| `@playwright/test@1.64.1` | Apache-2.0 | End-to-end browser smoke test runner | `testing/e2e/` |
| `FreeCAD` | LGPL-2.1+ | External test oracle tool only (via FreeCADCmd). Used to generate independent golden projection edge sets for verification. Zero FreeCAD code or binaries are bundled into application or runtime packages. | `testing/oracle/` |
| `WebCAD (Reference)` | MIT | Architecture reference audit for snap engines, command state machines, dimensions, and plot pipelines. Zero WebCAD code, GPLv2 LibreCAD icons, or GPLv3 osifont.ttf assets are bundled; cleanroom pure-TS implementations are used exclusively. | `docs/webcad-audit.md`, `src/sheet/` |
