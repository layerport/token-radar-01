// Token Radar's entrypoint (Node 22, standard library only).
//
// It reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// genuine pre-token protocol with the radar-2 model in lib/model.ts, writes the ranked board to
// /output/board.json, writes the dashboard's data to /output/data.js, and copies this
// repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes from
// the same board. The page recomputes every row's implied value and regenerates every farm plan
// from the same figures, so the code the judge reads and the board the gate checks are one
// arithmetic.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import * as fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRadar, dataScript, parseSnapshot, validateBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_CAP = 65_536;
const SHOT_CAP = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value of --name, in either --name value or --name=value form, or `fallback`. */
function flag(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === `--${name}` && i + 1 < args.length) return args[i + 1]!;
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!fs.existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(fs.readFileSync(inputFile, 'utf8'));
const { board, radar } = assembleRadar(snapshot);
const problem = validateBoard(board, snapshot);
if (problem !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
fs.writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!fs.existsSync(from)) return [];
  fs.mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of fs.readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!fs.statSync(path).isFile()) continue;
    fs.copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

const pageFiles = copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
if (pageFiles.length === 0) {
  process.stderr.write(`token radar: dashboard/ holds no files: hand in index.html, a .css and a .js file\n`);
  process.exit(1);
}
const shots = copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
fs.writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: TEXT_CAP, screenshots: SHOT_CAP, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${pageFiles.length} files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
