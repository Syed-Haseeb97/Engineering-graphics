# Agent Guidelines & Engineering Rules

> **MANDATORY**: Every future agent and automated session MUST read this file first before making changes or planning tasks.

---

## Non-Negotiable Core Rules

1. **Strict TypeScript Mode Always**:
   - TypeScript strict mode must remain enabled at all times (`"strict": true`, `"noUncheckedIndexedAccess": true`).
   - Do not bypass types with `any` unless wrapping an untyped external C/WASM interface, and isolate such boundaries immediately with strict type wrappers.

2. **No Geometry Code Without a Test**:
   - Write tests BEFORE geometry code.
   - Every single mathematical projection, rotation, intersection, snap calculation, or segment matcher must have accompanying unit tests covering nominal cases, boundary conditions, and degenerate scenarios.

3. **Kernel Isolation (No UI Imports Allowed)**:
   - `src/kernel` must remain strictly headless.
   - Never import DOM types, React/UI components, Canvas contexts, WebGL rendering code, or UI state into `src/kernel`.
   - Kernel code must be runnable in a headless WebWorker and headless Node/Server environments.

4. **Units Are Always Millimetres (mm)**:
   - All spatial measurements, coordinates, tolerances, and sheet layouts are defined in millimetres.
   - Never use pixels, inches, or arbitrary normalized units in geometric state or problem definitions.

5. **Never Commit Secrets or Sensitive Credentials**:
   - Do not commit API keys, service role keys, session tokens, or private environment files (`.env`, `.env.*`).
   - Use environment variable templates (`.env.example`) with dummy values for documentation.

6. **Ground-Truth Answers Never Ship to the Browser**:
   - Ground-truth geometric models, canonical solution vertices, and solving keys must never be exposed to student client bundles.
   - Grading occurs either server-side or via zero-knowledge challenge-response verification. Student clients only receive problem specifications and grading feedback results.

7. **One Small Vertical Slice Per Task**:
   - Keep tasks focused, bounded, and testable.
   - Do not attempt multi-feature rewrites in a single pass. Implement one vertical slice, verify with tests, lint, and typecheck before proceeding.

8. **Ask Before Adding Any Dependency**:
   - Do not run `npm install <new-pkg>` without explicit user permission.
   - Every approved dependency must be pinned with exact versions (no `^` or `~`).

9. **Record Every Design Decision in DECISIONS.md**:
   - Whenever an architectural or technical choice is made (libraries, data structures, algorithms, protocols), add a structured entry in `DECISIONS.md`.

10. **Track Every Reused Third-Party File in THIRD_PARTY.md**:
    - Any reused code, algorithm, shader, font, or WASM binary from external sources must be registered in the table in `THIRD_PARTY.md` with its component name, license, usage description, and file locations.
