/**
 * OCCT WASM & HLR Performance Benchmark (Standard vs 4x Throttled)
 *
 * Measures:
 * 1. WASM binary initialization and compilation time.
 * 2. 3D B-Rep solid construction times (Box, Cylinder, Cone, Pyramid).
 * 3. HLR projection edge extraction times across orthographic views.
 * 4. 2D segment normalization latency.
 * 5. Low-end profile simulation (4x CPU throttle).
 */

import { OcctKernel } from 'occt-wasm';
import { extractViewSegments } from '../src/kernel/hlr';
import { placeSolid } from '../src/kernel/placement';
import { buildCone, buildPrism, buildPyramid } from '../src/kernel/shapes';
import { normaliseSegments } from '../src/kernel/normalise';

export interface SolidBenchmarkResult {
  readonly solid: string;
  readonly buildTimeMs: number;
  readonly hlrFrontTimeMs: number;
  readonly hlrTopTimeMs: number;
  readonly normaliseTimeMs: number;
  readonly totalTimeMs: number;
  readonly edgeCount: {
    readonly front: number;
    readonly top: number;
  };
}

export interface WasmBenchmarkReport {
  readonly unthrottled: {
    readonly wasmInitMs: number;
    readonly solids: readonly SolidBenchmarkResult[];
    readonly averageHlrPerViewMs: number;
  };
  readonly throttled4x: {
    readonly simulatedWasmInitMs: number;
    readonly solids: readonly SolidBenchmarkResult[];
    readonly averageHlrPerViewMs: number;
  };
  readonly timestamp: string;
}

export async function runWasmBenchmark(): Promise<WasmBenchmarkReport> {
  const t0 = performance.now();
  const kernel = await OcctKernel.init();
  const wasmInitMs = performance.now() - t0;

  const solidsToTest = [
    {
      name: 'Square Prism (30x30x65 mm)',
      build: () => buildPrism(kernel, { sides: 4, baseSize: 30, height: 65 }),
      rotation: { thetaHP: 40, phiVP: 0 },
    },
    {
      name: 'Cone (Ø40 x L60 mm)',
      build: () => buildCone(kernel, { radius: 20, height: 60 }),
      rotation: { thetaHP: 30, phiVP: 30 },
    },
    {
      name: 'Pentagonal Pyramid (side 25 x L65 mm)',
      build: () => buildPyramid(kernel, { sides: 5, baseSize: 25, height: 65 }),
      rotation: { thetaHP: 45, phiVP: 30 },
    },
  ];

  const unthrottledSolids: SolidBenchmarkResult[] = [];
  let totalHlrTime = 0;
  let totalHlrViews = 0;

  for (const item of solidsToTest) {
    // 1. Build solid
    const tBuild0 = performance.now();
    const solid = item.build();
    const placedResult = placeSolid(kernel, solid, {
      distanceHP: 20,
      distanceVP: 25,
      thetaRad: (item.rotation.thetaHP * Math.PI) / 180,
      phiRad: (item.rotation.phiVP * Math.PI) / 180,
    });
    const placedHandle = placedResult.finalPlaced.handle;
    const buildTimeMs = performance.now() - tBuild0;

    // 2. Front View HLR
    const tFront0 = performance.now();
    const frontSegments = extractViewSegments(kernel, placedHandle, 'FRONT');
    const hlrFrontTimeMs = performance.now() - tFront0;

    // 3. Top View HLR
    const tTop0 = performance.now();
    const topSegments = extractViewSegments(kernel, placedHandle, 'TOP');
    const hlrTopTimeMs = performance.now() - tTop0;

    totalHlrTime += hlrFrontTimeMs + hlrTopTimeMs;
    totalHlrViews += 2;

    // 4. Normalise segments
    const tNorm0 = performance.now();
    const normFront = normaliseSegments(frontSegments);
    const normTop = normaliseSegments(topSegments);
    const normaliseTimeMs = performance.now() - tNorm0;

    const totalTimeMs = buildTimeMs + hlrFrontTimeMs + hlrTopTimeMs + normaliseTimeMs;

    unthrottledSolids.push({
      solid: item.name,
      buildTimeMs,
      hlrFrontTimeMs,
      hlrTopTimeMs,
      normaliseTimeMs,
      totalTimeMs,
      edgeCount: {
        front: normFront.length,
        top: normTop.length,
      },
    });

    kernel.release(placedHandle);
  }

  // =========================================================================
  // DISCLOSURE: The numbers in throttled4x below are COMPUTED ARITHMETICALLY
  // by multiplying the unthrottled Node.js measurements by a constant 4x factor.
  // They are NOT measured under genuine CPU throttling.
  // For authentic in-browser measurements under Chrome DevTools Protocol 4x CPU
  // throttling (Emulation.setCPUThrottlingRate: 4), see testing/e2e/throttled-benchmark.spec.ts.
  // =========================================================================
  const throttledSolids: SolidBenchmarkResult[] = unthrottledSolids.map((s) => ({
    solid: s.solid,
    buildTimeMs: s.buildTimeMs * 4,
    hlrFrontTimeMs: s.hlrFrontTimeMs * 4,
    hlrTopTimeMs: s.hlrTopTimeMs * 4,
    normaliseTimeMs: s.normaliseTimeMs * 4,
    totalTimeMs: s.totalTimeMs * 4,
    edgeCount: s.edgeCount,
  }));

  return {
    unthrottled: {
      wasmInitMs,
      solids: unthrottledSolids,
      averageHlrPerViewMs: totalHlrTime / totalHlrViews,
    },
    throttled4x: {
      simulatedWasmInitMs: wasmInitMs * 4,
      solids: throttledSolids,
      averageHlrPerViewMs: (totalHlrTime / totalHlrViews) * 4,
    },
    timestamp: new Date().toISOString(),
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('benchmark-wasm-hlr.ts')) {
  console.log('Running OCCT WebAssembly & HLR Benchmark...');
  runWasmBenchmark().then((report) => {
    console.log(`WASM Initialization Time: ${report.unthrottled.wasmInitMs.toFixed(1)} ms`);
    console.log(`4x Throttled Init:        ${report.throttled4x.simulatedWasmInitMs.toFixed(1)} ms\n`);

    console.log('Unthrottled Performance:');
    for (const s of report.unthrottled.solids) {
      console.log(`  [${s.solid}]`);
      console.log(`    Build Solid:   ${s.buildTimeMs.toFixed(2)} ms`);
      console.log(`    Front HLR:     ${s.hlrFrontTimeMs.toFixed(2)} ms (${s.edgeCount.front} edges)`);
      console.log(`    Top HLR:       ${s.hlrTopTimeMs.toFixed(2)} ms (${s.edgeCount.top} edges)`);
      console.log(`    Normalisation: ${s.normaliseTimeMs.toFixed(2)} ms`);
      console.log(`    Total View:    ${s.totalTimeMs.toFixed(2)} ms\n`);
    }

    console.log('Low-End Profile (CPU 4x Throttled):');
    for (const s of report.throttled4x.solids) {
      console.log(`  [${s.solid}]`);
      console.log(`    Total View:    ${s.totalTimeMs.toFixed(2)} ms`);
    }
  });
}
