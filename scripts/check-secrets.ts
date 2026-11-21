/**
 * Secrets Scanning Engine & CLI Checker
 *
 * Scans repository files for committed credentials, private keys, high-entropy tokens,
 * and database passwords before commits or deployments.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SecretFinding {
  readonly file: string;
  readonly line: number;
  readonly type: string;
  readonly matched: string;
}

export interface ScanResult {
  readonly filesScanned: number;
  readonly leaksFound: number;
  readonly findings: readonly SecretFinding[];
}

export interface ScanOptions {
  readonly rootDir?: string;
  readonly syntheticContent?: string;
  readonly fileExtensions?: readonly string[];
  readonly excludeDirs?: readonly string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.js', '.json', '.sql', '.env', '.yml', '.yaml', '.html', '.md'];
const DEFAULT_EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'coverage', 'reference', 'backups', '.playwright-browsers'];

/**
 * Explicit allowlist of exact relative file path + line number pairs for known false positives.
 * Generic file or markdown filters are strictly avoided.
 */
export const KNOWN_FALSE_POSITIVES_ALLOWLIST: Readonly<Record<string, readonly number[]>> = {
  // server/README.md: Line 86 is documented postgresql:// connection template with placeholder password
  'server/README.md': [86],
};

const SECRET_PATTERNS: readonly { type: string; regex: RegExp }[] = [
  {
    type: 'PRIVATE_KEY',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    type: 'AWS_ACCESS_KEY',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
  },
  {
    type: 'GITHUB_TOKEN',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,255}/,
  },
  {
    type: 'SUPABASE_SERVICE_ROLE_JWT',
    regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  },
  {
    type: 'SUPABASE_TOKEN',
    regex: /sbp_[a-zA-Z0-9]{40}/,
  },
  {
    type: 'HARDCODED_POSTGRES_CREDENTIAL',
    regex: /postgres(?:ql)?:\/\/[a-zA-Z0-9_]+:[^@\s]{8,}@[a-zA-Z0-9.-]+:[0-9]+\/[a-zA-Z0-9_]+/,
  },
  {
    type: 'GENERIC_API_KEY_OR_SECRET',
    regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_-]{32,}['"]/i,
  },
];

/** Check if a line is an allowed false positive, placeholder, or test fixture. */
function isExemptLine(line: string, filePath: string, lineNo: number): boolean {
  // 1. Explicit allowlist check of exact file + line pairs
  const normalized = filePath.replace(/\\/g, '/');
  for (const [allowedFile, lines] of Object.entries(KNOWN_FALSE_POSITIVES_ALLOWLIST)) {
    if (normalized.endsWith(allowedFile) && lines.includes(lineNo)) {
      return true;
    }
  }

  const lower = line.toLowerCase();
  // Safe documentation placeholders
  if (
    lower.includes('<password>') ||
    lower.includes('<your_password>') ||
    lower.includes('[password]') ||
    lower.includes('<token>')
  ) {
    return true;
  }

  // Safe test or mock tokens in test files
  if (
    filePath.includes('__tests__') ||
    filePath.includes('test.ts') ||
    filePath.includes('.spec.ts') ||
    filePath.includes('check-secrets.ts')
  ) {
    if (
      lower.includes('test_jwt') ||
      lower.includes('supabase_test') ||
      lower.includes('fake_') ||
      lower.includes('dummy') ||
      lower.includes('example') ||
      lower.includes('ops_safety')
    ) {
      return true;
    }
  }

  // Exempt .env.example templates
  if (filePath.endsWith('.example') || filePath.endsWith('.template')) {
    return true;
  }

  return false;
}

/** Recursively scan directory for eligible text files. */
function collectFiles(dir: string, extensions: readonly string[], excludeDirs: readonly string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        results.push(...collectFiles(fullPath, extensions, excludeDirs));
      }
    } else if (entry.isFile()) {
      if (entry.name === 'package-lock.json') continue; // Exclude massive hashes
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext) || entry.name.startsWith('.env')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Scan target directory or synthetic content for committed secrets.
 */
export function scanForSecrets(options: ScanOptions = {}): ScanResult {
  const findings: SecretFinding[] = [];

  // 1. Synthetic testing branch
  if (options.syntheticContent !== undefined) {
    const lines = options.syntheticContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          findings.push({
            file: '<synthetic>',
            line: i + 1,
            type: pattern.type,
            matched: line.trim().substring(0, 80),
          });
        }
      }
    }
    return {
      filesScanned: 1,
      leaksFound: findings.length,
      findings,
    };
  }

  // 2. Directory scan branch
  const rootDir = options.rootDir ?? path.resolve('.');
  const extensions = options.fileExtensions ?? DEFAULT_EXTENSIONS;
  const excludeDirs = options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;

  const files = collectFiles(rootDir, extensions, excludeDirs);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (isExemptLine(line, file, i + 1)) continue;

        for (const pattern of SECRET_PATTERNS) {
          if (pattern.regex.test(line)) {
            findings.push({
              file: path.relative(rootDir, file),
              line: i + 1,
              type: pattern.type,
              matched: line.trim().substring(0, 60),
            });
          }
        }
      }
    } catch {
      // Ignore unreadable binary or permission issues
    }
  }

  return {
    filesScanned: files.length,
    leaksFound: findings.length,
    findings,
  };
}

// CLI runner when executed directly
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('check-secrets.ts')) {
  console.log('Scanning repository for committed secrets & private keys...');
  const res = scanForSecrets();
  console.log(`Scanned ${res.filesScanned} files.`);

  if (res.leaksFound > 0) {
    console.error(`\x1b[31m[SECURITY ALERT] Found ${res.leaksFound} potential secret leak(s)!\x1b[0m`);
    for (const f of res.findings) {
      console.error(`  - [${f.type}] ${f.file}:${f.line} -> "${f.matched}"`);
    }
    process.exit(1);
  } else {
    console.log('\x1b[32m✓ Zero secrets or keys found in repository.\x1b[0m');
    process.exit(0);
  }
}
