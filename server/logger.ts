export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly message?: string;
  readonly [key: string]: unknown;
}

const FORBIDDEN_KEY_PATTERNS = [
  /secret/i,
  /seed/i,
  /salt/i,
  /token/i,
  /password/i,
  /auth/i,
  /key/i,
];

/**
 * Deep redaction filter that guarantees ground-truth coordinates, full drawings,
 * and cryptographic secrets are NEVER printed to stdout or logs.
 */
export function sanitizeLogData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Redact JWT or hex secrets if accidentally passed as strings
    if (data.startsWith('eyJ') || data.length > 60) {
      return '[REDACTED_STRING]';
    }
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    // If it is an array of CAD entities, summarize instead of logging all coordinates
    if (data.length > 5 && data[0] && typeof data[0] === 'object' && ('p1' in data[0] || 'type' in data[0])) {
      return {
        _summary: 'CAD_ENTITY_ARRAY',
        count: data.length,
      };
    }
    return data.map((item) => sanitizeLogData(item));
  }

  const obj = data as Record<string, unknown>;
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // 1. Redact Secrets
    if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      clean[key] = '[REDACTED]';
      continue;
    }

    // 2. Redact Full Drawing JSON
    if (key.toLowerCase().includes('drawing') || key === 'drawing_json') {
      if (value && typeof value === 'object' && 'entities' in (value as Record<string, unknown>)) {
        const ent = (value as { entities?: unknown[] }).entities;
        clean[key] = {
          _type: 'drawing_json_summary',
          entityCount: Array.isArray(ent) ? ent.length : 0,
        };
      } else {
        clean[key] = { _type: 'drawing_json_summary' };
      }
      continue;
    }

    // 3. Redact Ground Truth Geometry
    if (key === 'ground_truth' || key === 'groundTruth') {
      clean[key] = '[REDACTED_GROUND_TRUTH]';
      continue;
    }

    clean[key] = sanitizeLogData(value);
  }

  return clean;
}

export class StructuredLogger {
  public logs: StructuredLogEntry[] = [];
  public silent = false;

  public log(level: LogLevel, event: string, payload?: Record<string, unknown>): void {
    const sanitized = payload ? (sanitizeLogData(payload) as Record<string, unknown>) : {};
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...sanitized,
    };

    this.logs.push(entry);

    if (!this.silent) {
      console.log(JSON.stringify(entry));
    }
  }

  public info(event: string, payload?: Record<string, unknown>): void {
    this.log('info', event, payload);
  }

  public warn(event: string, payload?: Record<string, unknown>): void {
    this.log('warn', event, payload);
  }

  public error(event: string, payload?: Record<string, unknown>): void {
    this.log('error', event, payload);
  }

  public debug(event: string, payload?: Record<string, unknown>): void {
    this.log('debug', event, payload);
  }

  public clear(): void {
    this.logs = [];
  }
}

export const serverLogger = new StructuredLogger();
// Silence stdout in unit tests by default
serverLogger.silent = true;
