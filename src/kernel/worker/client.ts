import type {
  ComputeResult,
  PlacementConfig,
  SolidConfig,
  WorkerRequest,
  WorkerResponse,
} from './types';

export interface OcctWorkerClientOptions {
  readonly lazy?: boolean;
}

export class OcctWorkerClient {
  private worker: Worker | null = null;
  private pendingRequests: Map<
    string,
    {
      resolve: (res: ComputeResult) => void;
      reject: (err: Error) => void;
    }
  > = new Map();
  private reqCounter = 0;
  private isInitialized = false;
  private initResolvers: Array<() => void> = [];

  constructor(options: OcctWorkerClientOptions = { lazy: true }) {
    if (options.lazy === false) {
      this.ensureWorker();
    }
  }

  public ensureWorker(): Worker {
    if (!this.worker) {
      this.initWorker();
    }
    return this.worker!;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public async whenReady(): Promise<void> {
    if (this.isInitialized) return;
    return new Promise((resolve) => {
      this.initResolvers.push(resolve);
    });
  }

  public preload(): void {
    this.ensureWorker();
  }

  private initWorker(): void {
    // Vite Web Worker module instantiation
    this.worker = new Worker(new URL('./occt.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'INIT_OK') {
        this.isInitialized = true;
        const resolvers = this.initResolvers;
        this.initResolvers = [];
        for (const resolve of resolvers) {
          resolve();
        }
        return;
      }

      if (msg.type === 'COMPUTE_OK') {
        const handler = this.pendingRequests.get(msg.id);
        if (handler) {
          this.pendingRequests.delete(msg.id);
          handler.resolve(msg.data);
        }
        return;
      }

      if (msg.type === 'ERROR') {
        if (msg.id) {
          const handler = this.pendingRequests.get(msg.id);
          if (handler) {
            this.pendingRequests.delete(msg.id);
            handler.reject(new Error(msg.error));
          }
        } else {
          console.error('[OcctWorker Error]', msg.error);
        }
      }
    };

    // Send init ping
    const initReq: WorkerRequest = { type: 'INIT' };
    this.worker.postMessage(initReq);
  }

  public async compute(
    solid: SolidConfig,
    placement: PlacementConfig,
  ): Promise<ComputeResult> {
    this.ensureWorker();
    const id = `req_${++this.reqCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const req: WorkerRequest = {
        type: 'COMPUTE',
        id,
        solid,
        placement,
      };
      this.worker?.postMessage(req);
    });
  }

  public terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingRequests.clear();
    this.isInitialized = false;
  }
}
