import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/model.mjs', ['model.mjs', 'text/javascript; charset=utf-8']],
]);
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
createServer(async (request, response) => {
  const resource = files.get(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (!resource) { response.writeHead(404); response.end('No encontrado'); return; }
  try {
    const body = await readFile(join(root, resource[0]));
    response.writeHead(200, { 'Content-Type': resource[1], 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(500); response.end('Error de lectura'); }
}).listen(port, host, () => console.log(`FibraLab: http://${host}:${port}`));
