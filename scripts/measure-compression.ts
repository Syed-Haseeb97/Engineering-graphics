import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

const wasmPath = 'node_modules/occt-wasm/dist/occt-wasm.wasm';
const buf = fs.readFileSync(wasmPath);
const uncompressedBytes = buf.length;

console.log('Uncompressed:', uncompressedBytes, 'bytes (', (uncompressedBytes / (1024 * 1024)).toFixed(2), 'MB)');

const gz6 = zlib.gzipSync(buf, { level: 6 });
console.log('Gzip (level 6 - default):', gz6.length, 'bytes (', (gz6.length / (1024 * 1024)).toFixed(2), 'MB), ratio:', ((gz6.length / uncompressedBytes) * 100).toFixed(2) + '%');

const gz9 = zlib.gzipSync(buf, { level: 9 });
console.log('Gzip (level 9 - max):', gz9.length, 'bytes (', (gz9.length / (1024 * 1024)).toFixed(2), 'MB), ratio:', ((gz9.length / uncompressedBytes) * 100).toFixed(2) + '%');

const br4 = zlib.brotliCompressSync(buf, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
});
console.log('Brotli (quality 4 - dynamic web server):', br4.length, 'bytes (', (br4.length / (1024 * 1024)).toFixed(2), 'MB), ratio:', ((br4.length / uncompressedBytes) * 100).toFixed(2) + '%');

const br6 = zlib.brotliCompressSync(buf, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
});
console.log('Brotli (quality 6 - balanced):', br6.length, 'bytes (', (br6.length / (1024 * 1024)).toFixed(2), 'MB), ratio:', ((br6.length / uncompressedBytes) * 100).toFixed(2) + '%');

const br11 = zlib.brotliCompressSync(buf, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
});
console.log('Brotli (quality 11 - pre-compressed static asset):', br11.length, 'bytes (', (br11.length / (1024 * 1024)).toFixed(2), 'MB), ratio:', ((br11.length / uncompressedBytes) * 100).toFixed(2) + '%');
