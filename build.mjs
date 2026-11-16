import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const [html, css, model, app] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'styles.css'), 'utf8'),
  readFile(join(root, 'model.mjs'), 'utf8'),
  readFile(join(root, 'app.mjs'), 'utf8'),
]);

const modelInline = model.replaceAll(/^export /gm, '');
const appInline = app.replace(/^import \{[^\n]+\} from '\.\/model\.mjs';\r?\n/, '');
if (appInline === app) throw new Error('No se encontró la importación del modelo');

const output = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.mjs"></script>', `<script>\n${modelInline}\n${appInline}\n</script>`);
if (output === html || output.includes('src="app.mjs"') || output.includes('href="styles.css"')) {
  throw new Error('No se pudieron integrar todos los recursos');
}
const destination = join(root, 'FibraLab.html');
await writeFile(destination, output, 'utf8');
console.log(`Archivo autónomo creado: ${destination}`);
