import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { TaggedSegment2 } from '../src/kernel/types';
import type { ProblemTemplate } from '../src/problems/types';

export interface PoolMetrics {
  callCount: number;
  totalDurationMs: number;
  callDurations: number[];
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  activeTaskId: string | null;
}

interface TaskQueueItem {
  id: string;
  template: ProblemTemplate;
  params: Readonly<Record<string, number>>;
  resolve: (value: readonly TaggedSegment2[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class OcctThreadPool {
  private workers: WorkerState[] = [];
  private taskQueue: TaskQueueItem[] = [];
  private pendingTasks: Map<string, TaskQueueItem> = new Map();
  private taskIdCounter = 0;
  private isInitialized = false;
  private poolSize: number;
  public readonly metrics: PoolMetrics = {
    callCount: 0,
    totalDurationMs: 0,
    callDurations: [],
  };

  constructor(size?: number) {
    if (process.env.VITEST) {
      // In Vitest test runners, use direct in-process execution to avoid
      // loader issues with isolated worker thread isolates
      this.poolSize = 0;
    } else {
      this.poolSize = size ?? Math.max(1, Math.min(os.cpus().length, 8));
    }
  }

  public init(): void {
    if (this.isInitialized || this.poolSize === 0) return;
    this.isInitialized = true;

    const workerPath = path.resolve(import.meta.dirname ?? process.cwd(), 'occt-worker-thread.ts');
    const execArgv = process.execArgv.filter(
      (a) => a !== '--eval' && a !== process.argv[1] && !a.endsWith('load-test.ts'),
    );

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(workerPath, { execArgv });
        const state: WorkerState = {
          worker,
          busy: false,
          activeTaskId: null,
        };

        worker.on('message', (msg) => {
          if (msg.type === 'READY') return;

          const item = this.pendingTasks.get(msg.id);
          if (item) {
            clearTimeout(item.timer);
            this.pendingTasks.delete(msg.id);
            state.busy = false;
            state.activeTaskId = null;

            if (msg.success) {
              const dur = msg.durationMs ?? 0;
              this.metrics.callCount++;
              this.metrics.totalDurationMs += dur;
              this.metrics.callDurations.push(dur);
              item.resolve(msg.segments);
            } else {
              item.reject(new Error(msg.error ?? 'Worker computation failed'));
            }

            this.dispatchNext();
          }
        });

        worker.on('error', (err) => {
          console.error(`[OcctThreadPool Worker ${i} Error]`, err);
          this.handleWorkerFailure(state, err instanceof Error ? err : new Error(String(err)));
        });

        worker.on('exit', (exitCode) => {
          if (exitCode !== 0) {
            this.handleWorkerFailure(state, new Error(`Worker stopped with exit code ${exitCode}`));
          }
        });

        this.workers.push(state);
      } catch (err) {
        console.warn(`[OcctThreadPool] Could not spawn worker ${i}:`, err);
      }
    }
  }

  private handleWorkerFailure(state: WorkerState, err: Error): void {
    if (state.activeTaskId) {
      const item = this.pendingTasks.get(state.activeTaskId);
      if (item) {
        clearTimeout(item.timer);
        this.pendingTasks.delete(state.activeTaskId);
        item.reject(err);
      }
    }
    const idx = this.workers.indexOf(state);
    if (idx !== -1) {
      this.workers.splice(idx, 1);
    }
    state.busy = false;
    state.activeTaskId = null;
    this.dispatchNext();
  }

  public async compute(
    template: ProblemTemplate,
    params: Readonly<Record<string, number>>,
  ): Promise<readonly TaggedSegment2[]> {
    if (!this.isInitialized) {
      this.init();
    }

    if (this.workers.length === 0) {
      throw new Error('OcctThreadPool has no running worker threads.');
    }

    const id = `task_${++this.taskIdCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(id);
        reject(new Error(`OcctThreadPool task ${id} timed out after 10000ms`));
      }, 10000);

      const item: TaskQueueItem = { id, template, params, resolve, reject, timer };
      this.taskQueue.push(item);
      this.dispatchNext();
    });
  }

  private dispatchNext(): void {
    if (this.taskQueue.length === 0) return;

    const idleWorker = this.workers.find((w) => !w.busy);
    if (!idleWorker) return;

    const task = this.taskQueue.shift()!;
    idleWorker.busy = true;
    idleWorker.activeTaskId = task.id;
    this.pendingTasks.set(task.id, task);

    idleWorker.worker.postMessage({
      id: task.id,
      template: task.template,
      params: task.params,
    });
  }

  public getPoolSize(): number {
    return this.workers.length;
  }

  public resetMetrics(): void {
    this.metrics.callCount = 0;
    this.metrics.totalDurationMs = 0;
    this.metrics.callDurations = [];
  }

  public async shutdown(): Promise<void> {
    const promises = this.workers.map((w) => w.worker.terminate());
    await Promise.all(promises);
    this.workers = [];
    this.taskQueue = [];
    this.pendingTasks.clear();
    this.isInitialized = false;
  }
}

// Global thread pool singleton
let globalPool: OcctThreadPool | null = null;

export function getGlobalOcctThreadPool(): OcctThreadPool {
  if (!globalPool) {
    globalPool = new OcctThreadPool();
    globalPool.init();
  }
  return globalPool;
}
