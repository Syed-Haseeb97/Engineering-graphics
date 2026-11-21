import { describe, expect, it } from 'vitest';
import { LruTtlCache, GradingService } from '../grading-service';
import { RlsDatabase } from '../db/rls-engine';
import type { TaggedSegment2 } from '../../src/kernel/types';

describe('Ground Truth In-Memory LRU + TTL Cache Eviction', () => {
  it('evicts least recently used entry when capacity limit is reached', () => {
    const cache = new LruTtlCache<string, string>({ maxSize: 3, ttlMs: 60_000 });

    cache.set('seed_1', 'val_1');
    cache.set('seed_2', 'val_2');
    cache.set('seed_3', 'val_3');

    expect(cache.size).toBe(3);
    expect(cache.get('seed_1')).toBe('val_1');
    expect(cache.get('seed_2')).toBe('val_2');
    expect(cache.get('seed_3')).toBe('val_3');

    // Access seed_1 so seed_2 becomes the least recently used
    cache.get('seed_1');

    // Insert 4th item (exceeding maxSize of 3)
    cache.set('seed_4', 'val_4');

    expect(cache.size).toBe(3);
    // seed_2 was evicted because seed_1 was recently accessed!
    expect(cache.get('seed_2')).toBeUndefined();
    expect(cache.get('seed_1')).toBe('val_1');
    expect(cache.get('seed_3')).toBe('val_3');
    expect(cache.get('seed_4')).toBe('val_4');
  });

  it('evicts entries when TTL expires', async () => {
    const cache = new LruTtlCache<string, string>({ maxSize: 10, ttlMs: 30 }); // 30ms TTL

    cache.set('temp_seed', 'active_value');
    expect(cache.get('temp_seed')).toBe('active_value');

    // Wait 45 ms for TTL to lapse
    await new Promise((resolve) => setTimeout(resolve, 45));

    expect(cache.get('temp_seed')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('proves GradingService groundTruthCache integrates LRU limit and TTL', () => {
    const db = new RlsDatabase();
    const service = new GradingService(db, {
      cacheMaxSize: 2,
      cacheTtlMs: 50,
    });

    const cache = service.getGroundTruthCache();
    expect(cache.maxSize).toBe(2);
    expect(cache.ttlMs).toBe(50);

    const dummySeg: readonly TaggedSegment2[] = [
      {
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        lineType: 'visible',
        edgeKind: 'sharp',
      },
    ];

    cache.set('seed_A', dummySeg);
    cache.set('seed_B', dummySeg);
    expect(service.getGroundTruthCacheSize()).toBe(2);

    // Insert 3rd seed -> seed_A evicted
    cache.set('seed_C', dummySeg);
    expect(service.getGroundTruthCacheSize()).toBe(2);
    expect(cache.get('seed_A')).toBeUndefined();
    expect(cache.get('seed_B')).toBeDefined();
    expect(cache.get('seed_C')).toBeDefined();
  });
});
