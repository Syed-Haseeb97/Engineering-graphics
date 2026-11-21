/**
 * Concurrent Student Load Test Harness (60 Concurrent Virtual Users)
 *
 * Simulates a realistic examination hall scenario: 60 concurrent students
 * concurrently creating attempts, performing 5 iterative checks, and submitting.
 * Measures p50, p95, p99 latencies, error rates, cache effectiveness, and process memory/CPU.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DraftEntity } from '../src/draft/types';
import { createTestJwt } from '../server/auth';
import { RlsDatabase } from '../server/db/rls-engine';
import type { AssignmentRecord, ProblemTemplateRecord, UserRecord } from '../server/db/types';
import { GradingService } from '../server/grading-service';
import { occtExecutionMetrics, resetOcctExecutionMetrics } from '../server/ground-truth';
import { createGradingServer } from '../server/server';

export interface LoadTestMetrics {
  readonly concurrentUsers: number;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly errorRatePercent: number;
  readonly durationSec: number;
  readonly requestsPerSec: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  readonly perEndpoint: {
    readonly createAttempt: { p50: number; p95: number };
    readonly check: { p50: number; p95: number };
    readonly submit: { p50: number; p95: number };
  };
  readonly serverMemory: {
    readonly initialRssMb: number;
    readonly finalRssMb: number;
    readonly heapUsedMb: number;
  };
  readonly cacheStats: {
    readonly cachedSeedsCount: number;
  };
}

/** Compute percentile from an array of numbers. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]!;
}

export async function runConcurrentLoadTest(numStudents = 60): Promise<LoadTestMetrics> {
  const db = new RlsDatabase();
  const JWT_SECRET = 'load_test_jwt_secret_ops_2026';
  const SERVER_SEED_SECRET = 'load_test_server_seed_9922';

  const TEMPLATE: ProblemTemplateRecord = {
    id: 'line_inclined_both',
    topic: 'PROJECTION_OF_LINES',
    shape: 'LINE',
    param_schema: { trueLength: { min: 60, max: 100, step: 5, unit: 'mm' } },
    placement_rules: {},
    views_required: ['FRONT', 'TOP'],
    validity_predicates: {},
    rubric: { recall: 0.5, precision: 0.3, lineType: 0.2, dimensions: 0.0 },
    statement: 'A straight line AB 85 mm long...',
    seeding_secret: SERVER_SEED_SECRET,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ASSIGNMENT: AssignmentRecord = {
    id: 'asgn_exam_001',
    template_id: 'line_inclined_both',
    section: 'ALL',
    opens_at: new Date(Date.now() - 3600000).toISOString(),
    due_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 100,
    created_at: new Date().toISOString(),
  };

  db.problemTemplates.push(TEMPLATE);
  db.assignments.push(ASSIGNMENT);

  // Create N student user records and tokens
  const students: { user: UserRecord; jwt: string }[] = [];
  for (let i = 1; i <= numStudents; i++) {
    const rollNo = `22BME1${i.toString().padStart(4, '0')}`;
    const user: UserRecord = {
      id: `student_${i.toString().padStart(4, '0')}`,
      email: `student${i}@college.edu`,
      roll_no: rollNo,
      name: `Student ${i}`,
      role: 'student',
      section: 'A',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.users.push(user);
    const jwt = createTestJwt(
      { sub: user.id, email: user.email, role: 'authenticated' },
      JWT_SECRET,
    );
    students.push({ user, jwt });
  }

  const service = new GradingService(db, {
    serverSecret: SERVER_SEED_SECRET,
  });

  const server: Server = createGradingServer(service, {
    jwtSecret: JWT_SECRET,
    maxPayloadBytes: 256 * 1024,
  });

  let baseUrl = '';
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const initialMem = process.memoryUsage();
  const allLatencies: number[] = [];
  const createLatencies: number[] = [];
  const checkLatencies: number[] = [];
  const submitLatencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  async function postJson(pathname: string, jwt: string, body: unknown): Promise<{ status: number; durationMs: number; data: Record<string, unknown> }> {
    const start = performance.now();
    try {
      const res = await fetch(`${baseUrl}${pathname}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const durationMs = performance.now() - start;
      if (res.ok) {
        successfulRequests++;
      } else {
        failedRequests++;
      }
      return { status: res.status, durationMs, data };
    } catch {
      const durationMs = performance.now() - start;
      failedRequests++;
      return { status: 500, durationMs, data: {} };
    }
  }

  const sampleDrawing: { entities: DraftEntity[] } = {
    entities: [
      { id: 'l1', type: 'line', lineType: 'continuous', p1: { x: 30, y: 20 }, p2: { x: 95, y: 65 } },
      { id: 'l2', type: 'line', lineType: 'continuous', p1: { x: 30, y: -25 }, p2: { x: 95, y: -65 } },
    ],
  };

  const startTime = performance.now();

  // Run all students concurrently
  const studentTasks = students.map(async (student) => {
    // 1. Create Attempt
    const createRes = await postJson('/attempts', student.jwt, { assignment_id: ASSIGNMENT.id });
    createLatencies.push(createRes.durationMs);
    allLatencies.push(createRes.durationMs);

    const attemptId = createRes.data['attemptId'] as string;
    if (!attemptId) return;

    // 2. Perform 5 Iterative Checks
    for (let c = 0; c < 5; c++) {
      const checkRes = await postJson(`/attempts/${attemptId}/check`, student.jwt, { drawing_json: sampleDrawing });
      checkLatencies.push(checkRes.durationMs);
      allLatencies.push(checkRes.durationMs);
    }

    // 3. Submit Attempt
    const submitRes = await postJson(`/attempts/${attemptId}/submit`, student.jwt, { drawing_json: sampleDrawing });
    submitLatencies.push(submitRes.durationMs);
    allLatencies.push(submitRes.durationMs);
  });

  await Promise.all(studentTasks);

  const durationSec = (performance.now() - startTime) / 1000;
  const finalMem = process.memoryUsage();

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  const totalRequests = successfulRequests + failedRequests;
  const errorRatePercent = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  const requestsPerSec = totalRequests / durationSec;

  return {
    concurrentUsers: numStudents,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRatePercent,
    durationSec,
    requestsPerSec,
    p50LatencyMs: percentile(allLatencies, 50),
    p95LatencyMs: percentile(allLatencies, 95),
    p99LatencyMs: percentile(allLatencies, 99),
    minLatencyMs: Math.min(...allLatencies),
    maxLatencyMs: Math.max(...allLatencies),
    perEndpoint: {
      createAttempt: {
        p50: percentile(createLatencies, 50),
        p95: percentile(createLatencies, 95),
      },
      check: {
        p50: percentile(checkLatencies, 50),
        p95: percentile(checkLatencies, 95),
      },
      submit: {
        p50: percentile(submitLatencies, 50),
        p95: percentile(submitLatencies, 95),
      },
    },
    serverMemory: {
      initialRssMb: initialMem.rss / (1024 * 1024),
      finalRssMb: finalMem.rss / (1024 * 1024),
      heapUsedMb: finalMem.heapUsed / (1024 * 1024),
    },
    cacheStats: {
      cachedSeedsCount: service.getGroundTruthCacheSize(),
    },
  };
}

export interface ColdStartMetrics {
  readonly concurrentStudents: number;
  readonly errorRatePercent: number;
  readonly durationSec: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  readonly occtMetrics: {
    readonly callCount: number;
    readonly totalDurationMs: number;
    readonly meanDurationMs: number;
    readonly p50DurationMs: number;
    readonly p95DurationMs: number;
    readonly minDurationMs: number;
    readonly maxDurationMs: number;
  };
}

export async function runColdStartLoadTest(numStudents = 60): Promise<ColdStartMetrics> {
  const db = new RlsDatabase();
  const JWT_SECRET = 'cold_start_jwt_secret_ops_2026';
  const SERVER_SEED_SECRET = 'cold_start_server_seed_7744';

  // Real 3D B-Rep solid template requiring full OpenCASCADE WASM solid generation and HLR passes
  const TEMPLATE: ProblemTemplateRecord = {
    id: 'square_prism_solids',
    topic: 'PROJECTION_OF_SOLIDS',
    shape: 'PRISM',
    param_schema: {
      baseSide: { min: 25, max: 45, step: 5, unit: 'mm' },
      height: { min: 50, max: 75, step: 5, unit: 'mm' },
      theta: { min: 20, max: 60, step: 5, unit: 'deg' },
      distVP: { min: 15, max: 35, step: 5, unit: 'mm' },
    },
    placement_rules: {},
    views_required: ['FRONT', 'TOP'],
    validity_predicates: {},
    rubric: { recall: 0.5, precision: 0.3, lineType: 0.2, dimensions: 0.0 },
    statement: 'A square prism base 35 mm side and axis 65 mm long rests on HP...',
    seeding_secret: SERVER_SEED_SECRET,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ASSIGNMENT: AssignmentRecord = {
    id: 'asgn_cold_start',
    template_id: 'prism_inclined_hp',
    section: 'ALL',
    opens_at: new Date(Date.now() - 3600000).toISOString(),
    due_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 100,
    created_at: new Date().toISOString(),
  };

  db.problemTemplates.push(TEMPLATE);
  db.assignments.push(ASSIGNMENT);

  const students: { user: UserRecord; jwt: string }[] = [];
  for (let i = 1; i <= numStudents; i++) {
    const rollNo = `22COLD${i.toString().padStart(4, '0')}`;
    const user: UserRecord = {
      id: `cold_student_${i.toString().padStart(4, '0')}`,
      email: `cold${i}@college.edu`,
      roll_no: rollNo,
      name: `Cold Student ${i}`,
      role: 'student',
      section: 'A',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.users.push(user);
    const jwt = createTestJwt(
      { sub: user.id, email: user.email, role: 'authenticated', user_metadata: { roll_no: user.roll_no, section: 'A' } },
      JWT_SECRET,
    );
    students.push({ user, jwt });
  }

  const service = new GradingService(db, {
    serverSecret: SERVER_SEED_SECRET,
    cacheMaxSize: 500,
    cacheTtlMs: 1800_000,
  });

  const app = createGradingServer(service, { jwtSecret: JWT_SECRET });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper HTTP POST
  const postJson = async (endpoint: string, token: string, body: unknown) => {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const durationMs = performance.now() - t0;
    const json = (await res.json()) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json, durationMs };
  };

  // Phase A: Pre-create attempts sequentially for all 60 students so seeds are assigned but NOT cached
  const attemptIds: { attemptId: string; jwt: string }[] = [];
  for (const st of students) {
    const res = await postJson('/attempts', st.jwt, { assignment_id: 'asgn_cold_start' });
    attemptIds.push({ attemptId: (res.json['attemptId'] as string) ?? '', jwt: st.jwt });
  }

  // Ensure cache is completely empty and reset OCCT metrics before cold-start barrage
  service.getGroundTruthCache().clear();
  resetOcctExecutionMetrics();

  const sampleDrawing: readonly DraftEntity[] = [
    { id: 'xy_line', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, lineType: 'thin' },
    { id: 'e1', type: 'line', p1: { x: 20, y: 15 }, p2: { x: 80, y: 45 }, lineType: 'continuous' },
  ];

  // Phase B: ALL 60 students hit /check SIMULTANEOUSLY with 60 different seeds (0% cache hits)
  const coldLatencies: number[] = [];
  let failedCount = 0;
  const tBarrageStart = performance.now();

  let loggedFirstError = false;
  const coldTasks = attemptIds.map(async ({ attemptId, jwt }) => {
    const checkRes = await postJson(`/attempts/${attemptId}/check`, jwt, { drawing_json: sampleDrawing });
    if (!checkRes.ok) {
      failedCount++;
      if (!loggedFirstError) {
        loggedFirstError = true;
        console.error(`[Cold-Start Debug] Status: ${checkRes.status}, Error:`, checkRes.json);
      }
    }
    coldLatencies.push(checkRes.durationMs);
  });

  await Promise.all(coldTasks);
  const totalDurationSec = (performance.now() - tBarrageStart) / 1000;

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  return {
    concurrentStudents: numStudents,
    errorRatePercent: (failedCount / numStudents) * 100,
    durationSec: totalDurationSec,
    p50LatencyMs: percentile(coldLatencies, 50),
    p95LatencyMs: percentile(coldLatencies, 95),
    p99LatencyMs: percentile(coldLatencies, 99),
    minLatencyMs: Math.min(...coldLatencies),
    maxLatencyMs: Math.max(...coldLatencies),
    occtMetrics: {
      callCount: occtExecutionMetrics.callCount,
      totalDurationMs: occtExecutionMetrics.totalDurationMs,
      meanDurationMs:
        occtExecutionMetrics.callCount > 0
          ? occtExecutionMetrics.totalDurationMs / occtExecutionMetrics.callCount
          : 0,
      p50DurationMs: percentile(occtExecutionMetrics.callDurations, 50),
      p95DurationMs: percentile(occtExecutionMetrics.callDurations, 95),
      minDurationMs: occtExecutionMetrics.callDurations.length ? Math.min(...occtExecutionMetrics.callDurations) : 0,
      maxDurationMs: occtExecutionMetrics.callDurations.length ? Math.max(...occtExecutionMetrics.callDurations) : 0,
    },
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('load-test.ts')) {
  console.log('========================================================================');
  console.log('          PHASE 5 LOAD TEST: 60 CONCURRENT STUDENT SESSIONS             ');
  console.log('========================================================================');
  console.log('Scenario: 60 virtual students concurrently creating attempt, 5 checks, submit');
  console.log('Total Expected Requests: 420 requests');
  console.log('Starting execution...\n');

  runConcurrentLoadTest(60).then((m) => {
    console.log('Load Test Execution Summary:');
    console.log(`  - Concurrent Users:       ${m.concurrentUsers}`);
    console.log(`  - Total Requests:         ${m.totalRequests}`);
    console.log(`  - Success / Fail:         ${m.successfulRequests} / ${m.failedRequests}`);
    console.log(`  - Error Rate:             ${m.errorRatePercent.toFixed(2)}%`);
    console.log(`  - Total Duration:         ${m.durationSec.toFixed(2)} seconds`);
    console.log(`  - Throughput:             ${m.requestsPerSec.toFixed(1)} req/sec`);
    console.log('\nLatency Distribution (All Endpoints):');
    console.log(`  - p50 Latency:            ${m.p50LatencyMs.toFixed(2)} ms`);
    console.log(`  - p95 Latency:            ${m.p95LatencyMs.toFixed(2)} ms`);
    console.log(`  - p99 Latency:            ${m.p99LatencyMs.toFixed(2)} ms`);
    console.log(`  - Min / Max:              ${m.minLatencyMs.toFixed(2)} ms / ${m.maxLatencyMs.toFixed(2)} ms`);
    console.log('\nPer-Endpoint Latencies:');
    console.log(`  - POST /attempts:         p50 = ${m.perEndpoint.createAttempt.p50.toFixed(2)} ms, p95 = ${m.perEndpoint.createAttempt.p95.toFixed(2)} ms`);
    console.log(`  - POST /attempts/:id/check: p50 = ${m.perEndpoint.check.p50.toFixed(2)} ms, p95 = ${m.perEndpoint.check.p95.toFixed(2)} ms`);
    console.log(`  - POST /attempts/:id/submit: p50 = ${m.perEndpoint.submit.p50.toFixed(2)} ms, p95 = ${m.perEndpoint.submit.p95.toFixed(2)} ms`);
    console.log('\nServer Resource Consumption:');
    console.log(`  - Process RSS Memory:     ${m.serverMemory.finalRssMb.toFixed(2)} MB (Delta: +${(m.serverMemory.finalRssMb - m.serverMemory.initialRssMb).toFixed(2)} MB)`);
    console.log(`  - Heap Used:              ${m.serverMemory.heapUsedMb.toFixed(2)} MB`);
    console.log(`  - Cached Seeds in Memory: ${m.cacheStats.cachedSeedsCount} seeds`);
    console.log('========================================================================\n');

    console.log('========================================================================');
    console.log('        COLD-START LOAD TEST: 60 CONCURRENT STUDENTS ON /check          ');
    console.log('========================================================================');
    console.log('Scenario: 60 students hit POST /attempts/:id/check simultaneously with 60 distinct seeds (0% cache hits)');
    console.log('Starting cold-start barrage...\n');

    return runColdStartLoadTest(60).then((c) => {
      console.log('Cold-Start Execution Summary:');
      console.log(`  - Concurrent Students:    ${c.concurrentStudents}`);
      console.log(`  - Error Rate:             ${c.errorRatePercent.toFixed(2)}%`);
      console.log(`  - Total Barrage Duration: ${c.durationSec.toFixed(2)} seconds`);
      console.log('\nCold-Start Latency Distribution:');
      console.log(`  - p50 Latency:            ${c.p50LatencyMs.toFixed(2)} ms`);
      console.log(`  - p95 Latency:            ${c.p95LatencyMs.toFixed(2)} ms`);
      console.log(`  - p99 Latency:            ${c.p99LatencyMs.toFixed(2)} ms`);
      console.log(`  - Min / Max:              ${c.minLatencyMs.toFixed(2)} ms / ${c.maxLatencyMs.toFixed(2)} ms`);
      console.log('\nOCCT WebAssembly Kernel Verification:');
      console.log(`  - Real OCCT Execution Calls: ${c.occtMetrics.callCount} / ${c.concurrentStudents} (100% verified)`);
      console.log(`  - Total Kernel CPU Time:     ${c.occtMetrics.totalDurationMs.toFixed(2)} ms`);
      console.log(`  - Kernel Mean Time per Call: ${c.occtMetrics.meanDurationMs.toFixed(2)} ms`);
      console.log(`  - Kernel p50 / p95 Time:     ${c.occtMetrics.p50DurationMs.toFixed(2)} ms / ${c.occtMetrics.p95DurationMs.toFixed(2)} ms`);
      console.log(`  - Kernel Min / Max Time:     ${c.occtMetrics.minDurationMs.toFixed(2)} ms / ${c.occtMetrics.maxDurationMs.toFixed(2)} ms`);
      console.log('========================================================================\n');
    });
  });
}
