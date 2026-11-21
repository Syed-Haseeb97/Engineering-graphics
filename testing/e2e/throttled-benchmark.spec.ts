import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

test.describe('Browser Performance Benchmark: 4x Throttle, Cold/Warm & Cross-Engine', () => {
  test('measures drafting canvas interactive and 3D viewer ready across cold and warm visits', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const projectName = test.info().project.name;
    const isChromium = projectName === 'chromium';

    // 1. Establish CDP session & apply real 4x CPU throttling if on Chromium
    if (isChromium) {
      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }

    // Helper to measure drafting interactive by committing a LINE via synthetic clicks
    async function measureDraftingInteractive(): Promise<number> {
      const t0 = Date.now();
      await page.goto('/draft.html', { waitUntil: 'commit' });
      const canvas = page.locator('#draft-canvas');
      await canvas.waitFor({ state: 'visible', timeout: 30000 });
      const box = await canvas.boundingBox();
      if (!box) throw new Error('Canvas bounding box not found');
      // Synthetic clicks committing a LINE: point 1 then point 2
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.mouse.click(box.x + 200, box.y + 100);
      await page.waitForFunction(() => {
        const app = (window as unknown as { __draftApp?: { engine: { getEntities: () => unknown[] } } }).__draftApp;
        return app && app.engine.getEntities().length > 0;
      }, { timeout: 30000 });
      return Date.now() - t0;
    }

    // 2. Measure Drafting Canvas Interactive (First Visit - Cold)
    const draftColdMs = await measureDraftingInteractive();

    // 3. Measure Drafting Canvas Interactive (Repeat Visit - Warm Cache)
    const draftWarmMs = await measureDraftingInteractive();

    // 4. Measure 3D Viewer Ready (First Visit - Cold)
    const tViewerCold0 = Date.now();
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const app = (window as unknown as { __teachingViewerApp?: { getComputeResult: () => unknown } })
          .__teachingViewerApp;
        return app && app.getComputeResult() !== null;
      },
      { timeout: 60000 },
    );
    const viewerColdMs = Date.now() - tViewerCold0;

    // Extract WASM download and initialization timings from browser performance entries
    const wasmTimings = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const wasmEntry = resources.find((r) => r.name.includes('.wasm'));
      const app = (window as unknown as {
        __teachingViewerApp?: {
          getComputeResult: () => { timings?: { wasmInitMs: number; buildMs: number; hlrMs: number; totalMs: number } };
        };
      }).__teachingViewerApp;
      const initialCompute = app ? app.getComputeResult() : null;

      return {
        wasmDownloadDurationMs: wasmEntry ? wasmEntry.responseEnd - wasmEntry.fetchStart : 0,
        wasmDataTransferBytes: wasmEntry ? wasmEntry.transferSize : 0,
        workerWasmInitMs: initialCompute?.timings?.wasmInitMs ?? 0,
      };
    });

    // 5. Measure 3D Viewer Ready (Repeat Visit - Warm Cache)
    const tViewerWarm0 = Date.now();
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const app = (window as unknown as { __teachingViewerApp?: { getComputeResult: () => unknown } })
          .__teachingViewerApp;
        return app && app.getComputeResult() !== null;
      },
      { timeout: 60000 },
    );
    const viewerWarmMs = Date.now() - tViewerWarm0;

    // Benchmark HLR with 5 runs each for Prism, Cone, Pyramid
    const hlrResults = await page.evaluate(async () => {
      const app = (window as unknown as {
        __teachingViewerApp?: {
          getClient: () => {
            compute: (
              solid: unknown,
              placement: unknown,
            ) => Promise<{
              timings?: { wasmInitMs: number; buildMs: number; hlrMs: number; totalMs: number };
              stages: Array<{ front: unknown[]; top: unknown[]; side: unknown[] }>;
            }>;
          };
        };
      }).__teachingViewerApp!;

      const client = app.getClient();

      async function run5(solid: unknown, placement: unknown) {
        const runs: Array<{ roundtripMs: number; buildMs: number; hlrMs: number }> = [];
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          const res = await client.compute(solid, placement);
          const roundtripMs = performance.now() - t0;
          runs.push({
            roundtripMs,
            buildMs: res.timings?.buildMs ?? 0,
            hlrMs: res.timings?.hlrMs ?? 0,
          });
        }
        return runs;
      }

      const prismRuns = await run5(
        { type: 'PRISM', sides: 4, baseSize: 30, height: 65 },
        { initialAxis: 'PERPENDICULAR_TO_HP', thetaDeg: 40, phiDeg: 0, distanceHP: 20, distanceVP: 25 },
      );

      const coneRuns = await run5(
        { type: 'CONE', baseSize: 20, height: 60 },
        { initialAxis: 'PERPENDICULAR_TO_HP', thetaDeg: 30, phiDeg: 30, distanceHP: 20, distanceVP: 25 },
      );

      const pyramidRuns = await run5(
        { type: 'PYRAMID', sides: 5, baseSize: 25, height: 65 },
        { initialAxis: 'PERPENDICULAR_TO_HP', thetaDeg: 45, phiDeg: 30, distanceHP: 20, distanceVP: 25 },
      );

      return { prismRuns, coneRuns, pyramidRuns };
    });

    const prismRoundtrips = hlrResults.prismRuns.map((r) => r.roundtripMs);
    const coneRoundtrips = hlrResults.coneRuns.map((r) => r.roundtripMs);
    const pyramidRoundtrips = hlrResults.pyramidRuns.map((r) => r.roundtripMs);

    const prismStats = {
      min: Math.min(...prismRoundtrips),
      median: median(prismRoundtrips),
      max: Math.max(...prismRoundtrips),
      meanBuildMs: hlrResults.prismRuns.reduce((a, b) => a + b.buildMs, 0) / 5,
      meanHlrMs: hlrResults.prismRuns.reduce((a, b) => a + b.hlrMs, 0) / 5,
    };

    const coneStats = {
      min: Math.min(...coneRoundtrips),
      median: median(coneRoundtrips),
      max: Math.max(...coneRoundtrips),
      meanBuildMs: hlrResults.coneRuns.reduce((a, b) => a + b.buildMs, 0) / 5,
      meanHlrMs: hlrResults.coneRuns.reduce((a, b) => a + b.hlrMs, 0) / 5,
    };

    const pyramidStats = {
      min: Math.min(...pyramidRoundtrips),
      median: median(pyramidRoundtrips),
      max: Math.max(...pyramidRoundtrips),
      meanBuildMs: hlrResults.pyramidRuns.reduce((a, b) => a + b.buildMs, 0) / 5,
      meanHlrMs: hlrResults.pyramidRuns.reduce((a, b) => a + b.hlrMs, 0) / 5,
    };

    const browserVersion = page.context().browser()?.version() ?? 'Unknown';
    const isoDate = new Date().toISOString();

    console.log(`\n======================================================`);
    console.log(`BENCHMARK RESULTS: ${projectName.toUpperCase()} ${browserVersion}`);
    console.log(`Page Throttling:   ${isChromium ? '4x CPU Throttle (CDP)' : 'UNAVAILABLE (Native Hardware Speed)'}`);
    console.log(`Worker Throttling: NOT PROPAGATED to WebWorker (Runs at native hardware speed)`);
    console.log(`Date:              ${isoDate}`);
    console.log(`======================================================`);
    console.log(`Drafting Canvas Interactive (Cold, Synthetic Click): ${draftColdMs} ms`);
    console.log(`Drafting Canvas Interactive (Warm, Synthetic Click): ${draftWarmMs} ms`);
    console.log(`3D Viewer Ready (Cold):                             ${viewerColdMs} ms`);
    console.log(`3D Viewer Ready (Warm):                             ${viewerWarmMs} ms`);
    console.log(`WASM Compile + Init:                                ${wasmTimings.workerWasmInitMs.toFixed(2)} ms`);
    console.log(
      `Square Prism 3-view (5 runs): min=${prismStats.min.toFixed(2)} ms, med=${prismStats.median.toFixed(2)} ms, max=${prismStats.max.toFixed(2)} ms (Build: ${prismStats.meanBuildMs.toFixed(2)} ms, HLR: ${prismStats.meanHlrMs.toFixed(2)} ms) [NOT VERIFIED under worker throttle]`,
    );
    console.log(
      `Cone 3-view (5 runs):         min=${coneStats.min.toFixed(2)} ms, med=${coneStats.median.toFixed(2)} ms, max=${coneStats.max.toFixed(2)} ms (Build: ${coneStats.meanBuildMs.toFixed(2)} ms, HLR: ${coneStats.meanHlrMs.toFixed(2)} ms) [NOT VERIFIED under worker throttle]`,
    );
    console.log(
      `Pyramid 3-view (5 runs):      min=${pyramidStats.min.toFixed(2)} ms, med=${pyramidStats.median.toFixed(2)} ms, max=${pyramidStats.max.toFixed(2)} ms (Build: ${pyramidStats.meanBuildMs.toFixed(2)} ms, HLR: ${pyramidStats.meanHlrMs.toFixed(2)} ms) [NOT VERIFIED under worker throttle]`,
    );
    console.log(`======================================================\n`);

    expect(draftColdMs).toBeGreaterThan(0);
    expect(draftWarmMs).toBeGreaterThan(0);
    expect(viewerColdMs).toBeGreaterThan(0);
    expect(viewerWarmMs).toBeGreaterThan(0);

    // Save browser benchmark metrics to disk for summary consolidation
    const resultsDir = path.resolve(process.cwd(), '.perf-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const resultFile = path.join(resultsDir, `${projectName}.json`);
    fs.writeFileSync(
      resultFile,
      JSON.stringify(
        {
          project: projectName,
          browserVersion,
          pageThrottled: isChromium,
          workerThrottled: false,
          throttlingMethod: isChromium
            ? 'CDP Emulation.setCPUThrottlingRate: 4 on Page context (WebWorker thread unthrottled)'
            : 'Unavailable in engine (Native)',
          isoDate,
          draftColdMs,
          draftWarmMs,
          viewerColdMs,
          viewerWarmMs,
          workerWasmInitMs: wasmTimings.workerWasmInitMs,
          prismStats,
          coneStats,
          pyramidStats,
        },
        null,
        2,
      ),
      'utf-8',
    );
  });
});
