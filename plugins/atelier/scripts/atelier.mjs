#!/usr/bin/env node
/**
 * Atelier — project ledger for Claude Code.
 *
 * One Markdown/JSON registry per repository:
 *   .atelier/project.json   project metadata
 *   .atelier/tasks/*.json   tasks, tickets and bugs
 *   .atelier/kb/            knowledge base
 *   .atelier/runs/          subagent reports
 *   .atelier/plan.md        generated, human-readable plan
 *   .atelier/status.json    generated, read by the status line
 *
 * No dependency, no network, no secret. Node 20+.
 */

import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const VERSION = '0.1.0';
const LEDGER = '.atelier';
const STALE_LOCK_MS = 2 * 60 * 60 * 1000;
const STALE_ID_LOCK_MS = 10 * 1000;
const IDLE_LOCK_MS = 10 * 1000;

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done', 'dropped'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const KINDS = ['task', 'bug', 'ticket', 'research', 'docs', 'chore'];
const KIND_PREFIX = { task: 'T', bug: 'B', ticket: 'Q', research: 'R', docs: 'D', chore: 'C' };
const DEFAULT_TYPE = {
  task: 'feature',
  bug: 'bug',
  ticket: 'ticket',
  research: 'research',
  docs: 'docs',
  chore: 'chore',
};

// ---------------------------------------------------------------------------
// Small utilities

const now = () => new Date().toISOString();

function die(message, code = 1) {
  process.stderr.write(`atelier: ${message}\n`);
  process.exit(code);
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Write JSON through a temporary file so a crash cannot truncate the ledger. */
function writeJson(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

function writeText(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, value, 'utf8');
  renameSync(tmp, path);
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

/** Fold accents and case so searches and slugs behave in French. */
function fold(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function slugify(value) {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'note';
}

function toArray(value) {
  if (value === undefined || value === null || value === false) return [];
  return Array.isArray(value) ? value : [value];
}

function splitList(value) {
  return toArray(value)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
      continue;
    }
    const equal = arg.indexOf('=');
    let key;
    let value;
    if (equal >= 0) {
      key = arg.slice(2, equal);
      value = arg.slice(equal + 1);
    } else {
      key = arg.slice(2);
      if (key.startsWith('no-')) {
        flags[key.slice(3)] = false;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }
    if (flags[key] === undefined) flags[key] = value;
    else if (Array.isArray(flags[key])) flags[key].push(value);
    else flags[key] = [flags[key], value];
  }
  return { flags, positionals };
}

function flag(flags, name, fallback = undefined) {
  const value = flags[name];
  return value === undefined ? fallback : value;
}

function numberFlag(flags, name, fallback) {
  const value = flag(flags, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function detectGitRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status === 0) {
    const path = result.stdout.trim();
    if (path) return resolve(path);
  }
  return null;
}

/** Walk up until a project.json is found; returns the repository root. */
function findRoot(start = process.cwd()) {
  let current = resolve(start);
  for (let depth = 0; depth < 24; depth += 1) {
    if (existsSync(join(current, LEDGER, 'project.json'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function ledgerPaths(root) {
  const base = join(root, LEDGER);
  return {
    base,
    project: join(base, 'project.json'),
    tasks: join(base, 'tasks'),
    locks: join(base, 'locks'),
    runs: join(base, 'runs'),
    kb: join(base, 'kb'),
    notes: join(base, 'kb', 'notes'),
    decisions: join(base, 'kb', 'decisions'),
    kbIndex: join(base, 'kb', 'index.md'),
    plan: join(base, 'plan.md'),
    status: join(base, 'status.json'),
    bin: join(base, 'bin'),
  };
}

function requireProject(flags = {}) {
  const root = flags.root ? resolve(flags.root) : findRoot(process.cwd());
  if (!root) {
    die(
      "aucun registre Atelier trouvé. Lancez `atelier init` à la racine du dépôt, puis `/atelier:plan <objectif>`.",
    );
  }
  const project = readJson(join(root, LEDGER, 'project.json'), null);
  if (!project) die(`registre illisible : ${join(root, LEDGER, 'project.json')}`);
  return { root, project, paths: ledgerPaths(root) };
}

// ---------------------------------------------------------------------------
// Tasks

function taskFiles(root) {
  const dir = join(root, LEDGER, 'tasks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('.tmp'))
    .sort();
}

function loadTasks(root) {
  const tasks = [];
  for (const name of taskFiles(root)) {
    const path = join(root, LEDGER, 'tasks', name);
    let task;
    try {
      task = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      die(`tâche illisible ${name} : ${error.message}`);
    }
    if (!task.id) die(`tâche sans identifiant : ${name}`);
    tasks.push(task);
  }
  return tasks;
}

function saveTask(root, task) {
  task.updated_at = now();
  writeJson(join(root, LEDGER, 'tasks', `${task.id}.json`), task);
}

function normaliseId(value) {
  return String(value).trim().toUpperCase();
}

function findTask(root, id) {
  const wanted = normaliseId(id);
  return loadTasks(root).find((task) => normaliseId(task.id) === wanted) || null;
}

function requireTask(root, id) {
  const task = findTask(root, id);
  if (!task) die(`tâche inconnue : ${id}`);
  return task;
}

function nextId(root, kind) {
  const prefix = KIND_PREFIX[kind];
  if (!prefix) die(`type inconnu : ${kind}`);
  const numbers = taskFiles(root)
    .map((name) => name.match(new RegExp(`^${prefix}-(\\d+)\\.json$`)))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function withIdLock(root, callback) {
  const path = join(root, LEDGER, 'locks', '.id.lock');
  ensureDir(dirname(path));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      try {
        return callback();
      } finally {
        try {
          unlinkSync(path);
        } catch {
          /* already gone */
        }
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > STALE_ID_LOCK_MS) unlinkSync(path);
      } catch {
        /* race with another process */
      }
      sleepSync(25);
    }
  }
  die("impossible d'attribuer un identifiant : verrou occupé");
}

function lockPath(root, id) {
  return join(root, LEDGER, 'locks', `${normaliseId(id)}.lock`);
}

function readLock(root, id) {
  const path = lockPath(root, id);
  try {
    const payload = readJson(path, {}) || {};
    return { ...payload, mtimeMs: statSync(path).mtimeMs, path };
  } catch {
    return null;
  }
}

function activeLock(root, id) {
  const lock = readLock(root, id);
  if (!lock) return null;
  if (Date.now() - lock.mtimeMs > STALE_LOCK_MS) {
    try {
      unlinkSync(lock.path);
    } catch {
      /* ignore */
    }
    return null;
  }
  return lock;
}

function acquireLock(root, id, agent) {
  ensureDir(join(root, LEDGER, 'locks'));
  const path = lockPath(root, id);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, JSON.stringify({ agent, at: now(), pid: process.pid }));
      closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = readLock(root, id);
      if (existing && Date.now() - existing.mtimeMs <= STALE_LOCK_MS) {
        die(
          `tâche déjà verrouillée par « ${existing.agent || 'inconnu'} » depuis ${existing.at || '?'}. ` +
            'Attendez ou supprimez le verrou manuellement si le processus est mort.',
        );
      }
      try {
        unlinkSync(path);
      } catch {
        /* another process removed it */
      }
    }
  }
  die(`impossible de verrouiller ${normaliseId(id)}`);
}

function releaseLock(root, id) {
  try {
    unlinkSync(lockPath(root, id));
  } catch {
    /* already gone */
  }
}

function dependenciesSatisfied(task, byId) {
  return (task.depends_on || []).every((id) => byId.get(normaliseId(id))?.status === 'done');
}

function isReady(root, task, byId) {
  if (task.status !== 'todo') return false;
  if (!dependenciesSatisfied(task, byId)) return false;
  return !activeLock(root, task.id);
}

function priorityRank(value) {
  const index = PRIORITIES.indexOf(value);
  return index === -1 ? PRIORITIES.length : index;
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    if (priority !== 0) return priority;
    return String(a.id).localeCompare(String(b.id));
  });
}

function addJournal(task, text, agent = 'human') {
  task.journal = Array.isArray(task.journal) ? task.journal : [];
  task.journal.push({ at: now(), agent, text });
}

// ---------------------------------------------------------------------------
// Rendering: plan.md, status.json, knowledge-base index

function buildStatus(root, project, tasks) {
  const byId = new Map(tasks.map((task) => [normaliseId(task.id), task]));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const task of tasks) {
    if (counts[task.status] !== undefined) counts[task.status] += 1;
  }
  const ready = sortTasks(tasks.filter((task) => isReady(root, task, byId)));
  const inProgress = tasks.filter((task) => task.status === 'in_progress');
  const inReview = tasks.filter((task) => task.status === 'review');
  const blocked = tasks.filter((task) => task.status === 'blocked');
  const total = tasks.length;
  const done = counts.done || 0;
  const progress = total ? Math.round((done / total) * 100) : 0;

  let line;
  if (!total) line = 'aucune tâche';
  else if (inProgress.length) {
    const first = inProgress[0];
    const agent = String(first.assignee || 'impl').replace(/^atelier-/, '');
    line = `${done}/${total} · ${first.id} ${agent}`;
  } else if (ready.length) line = `${done}/${total} · ${ready.length} prêtes`;
  else if (blocked.length) line = `${done}/${total} · ${blocked.length} bloquées`;
  else if (done === total) line = `${done}/${total} · terminé`;
  else line = `${done}/${total}`;

  return {
    version: 1,
    project: project.name,
    generated_at: now(),
    total,
    done,
    progress,
    counts,
    in_progress: inProgress.map((task) => ({
      id: task.id,
      title: task.title,
      agent: task.assignee || null,
    })),
    review: inReview.map((task) => ({ id: task.id, title: task.title })),
    ready: ready.map((task) => task.id),
    blocked: blocked.map((task) => ({
      id: task.id,
      title: task.title,
      reason: task.blocked_reason || null,
    })),
    line,
  };
}

function acceptanceLabel(task) {
  const list = Array.isArray(task.acceptance) ? task.acceptance : [];
  if (!list.length) return 'aucun critère';
  const done = list.filter((item) => item.done).length;
  return `${done}/${list.length} critères`;
}

function taskLine(task) {
  const box = task.status === 'done' ? '[x]' : '[ ]';
  const deps = (task.depends_on || []).length ? ` — dépend de ${task.depends_on.join(', ')}` : '';
  const label = `${box} ${task.id} — ${task.title}`;
  if (task.status === 'done') {
    const when = task.done_at ? task.done_at.slice(0, 10) : 'fait';
    const forced = task.forced ? ' · dérogation' : '';
    return `${label} (${when}${forced})`;
  }
  if (task.status === 'dropped') return `[—] ${task.id} — ${task.title} (abandonnée)`;
  return `${label} (${acceptanceLabel(task)}${deps})`;
}

function renderPlan(root, project, tasks, status) {
  const byId = new Map(tasks.map((task) => [normaliseId(task.id), task]));
  const lines = [];
  lines.push(`# Plan — ${project.name}`);
  lines.push('');
  lines.push('<!-- Généré par `atelier render`. Ne pas éditer à la main. -->');
  lines.push('');
  lines.push(`> Mis à jour : ${status.generated_at.slice(0, 16).replace('T', ' ')} UTC`);
  lines.push(
    `> Progression : **${status.done}/${status.total}** (${status.progress} %) · ` +
      `en cours ${status.counts.in_progress} · en revue ${status.counts.review} · ` +
      `prêtes ${status.ready.length} · bloquées ${status.counts.blocked}`,
  );
  lines.push('');

  lines.push('## En cours');
  lines.push('');
  if (!status.in_progress.length) lines.push('_Aucune tâche en cours._');
  for (const item of status.in_progress) {
    lines.push(`- **${item.id}** — ${item.title}${item.agent ? ` · agent \`${item.agent}\`` : ''}`);
  }
  lines.push('');

  lines.push('## En revue');
  lines.push('');
  if (!status.review.length) lines.push('_Aucune tâche en attente de vérification._');
  for (const item of status.review) lines.push(`- **${item.id}** — ${item.title}`);
  lines.push('');

  lines.push('## Prêtes maintenant');
  lines.push('');
  if (!status.ready.length) lines.push('_Aucune tâche prête : soit tout est fait, soit des dépendances bloquent._');
  for (const id of status.ready) {
    const task = byId.get(id);
    if (task) lines.push(`- **${task.id}** — ${task.title} · ${task.priority}`);
  }
  lines.push('');

  if (status.blocked.length) {
    lines.push('## Bloquées');
    lines.push('');
    for (const item of status.blocked) {
      lines.push(`- **${item.id}** — ${item.title}${item.reason ? ` · ${item.reason}` : ''}`);
    }
    lines.push('');
  }

  const epics = new Map();
  for (const task of tasks) {
    const key = task.epic || 'Sans épopée';
    if (!epics.has(key)) epics.set(key, []);
    epics.get(key).push(task);
  }
  const epicKeys = [...epics.keys()].sort((a, b) => {
    if (a === 'Sans épopée') return 1;
    if (b === 'Sans épopée') return -1;
    return a.localeCompare(b);
  });

  lines.push('## Tâches par épopée');
  lines.push('');
  for (const key of epicKeys) {
    lines.push(`### ${key}`);
    lines.push('');
    for (const task of sortTasks(epics.get(key))) lines.push(`- ${taskLine(task)}`);
    lines.push('');
  }

  lines.push('## Toutes les tâches');
  lines.push('');
  lines.push('| ID | Statut | Priorité | Titre | Agent |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const task of sortTasks(tasks)) {
    const title = String(task.title).replace(/\|/g, '\\|');
    lines.push(
      `| ${task.id} | ${task.status} | ${task.priority} | ${title} | ${task.assignee || '—'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function noteFiles(root) {
  const paths = ledgerPaths(root);
  const files = [];
  for (const [dir, kind] of [
    [paths.notes, 'note'],
    [paths.decisions, 'decision'],
  ]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.md')).sort()) {
      files.push({ path: join(dir, name), kind, name });
    }
  }
  return files;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const block = text.slice(3, end).trim();
  const result = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    result[match[1]] = value;
  }
  return result;
}

function renderKbIndex(root) {
  const paths = ledgerPaths(root);
  ensureDir(paths.kb);
  const entries = noteFiles(root).map((file) => {
    const text = readFileSync(file.path, 'utf8');
    const meta = parseFrontmatter(text);
    return {
      ...file,
      title: meta.title || basename(file.name, '.md'),
      type: meta.type || file.kind,
      tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
      created: meta.created || '',
      task: meta.task || '',
    };
  });

  const lines = [];
  lines.push('# Base de connaissances');
  lines.push('');
  lines.push('<!-- Généré par `atelier kb index`. Ne pas éditer à la main. -->');
  lines.push('');
  if (!entries.length) {
    lines.push('_Aucune note. Ajoutez-en avec `/atelier:learn` ou `atelier kb add`._');
    lines.push('');
    return lines.join('\n');
  }
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.type)) groups.set(entry.type, []);
    groups.get(entry.type).push(entry);
  }
  const typeLabels = {
    decision: 'Décisions',
    note: 'Notes',
    research: 'Recherches',
    reference: 'Références',
  };
  for (const [type, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${typeLabels[type] || type}`);
    lines.push('');
    for (const entry of list.sort((a, b) => a.title.localeCompare(b.title))) {
      const relative = entry.path
        .slice(paths.kb.length + 1)
        .split('\\')
        .join('/');
      const tags = entry.tags.length ? ` · ${entry.tags.map((tag) => `#${tag}`).join(' ')}` : '';
      const task = entry.task ? ` · liée à ${entry.task}` : '';
      const date = entry.created ? ` · ${entry.created.slice(0, 10)}` : '';
      lines.push(`- [${entry.title}](${relative})${tags}${task}${date}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Regenerate plan.md, status.json and the knowledge-base index. */
function refresh(root) {
  const project = readJson(join(root, LEDGER, 'project.json'), null);
  if (!project) return null;
  const tasks = loadTasks(root);
  const status = buildStatus(root, project, tasks);
  writeJson(join(root, LEDGER, 'status.json'), status);
  writeText(join(root, LEDGER, 'plan.md'), renderPlan(root, project, tasks, status));
  writeText(join(root, LEDGER, 'kb', 'index.md'), renderKbIndex(root));
  return status;
}

// ---------------------------------------------------------------------------
// Initialisation

function detectPackageManager(root) {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function detectChecks(root) {
  const checks = [];
  const packagePath = join(root, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = readJson(packagePath, {}) || {};
    const scripts = pkg.scripts || {};
    const manager = detectPackageManager(root);
    const run = (script) => (manager === 'npm' ? `npm run ${script}` : `${manager} run ${script}`);
    if (scripts.check) checks.push(run('check'));
    else if (scripts.test) checks.push(manager === 'npm' ? 'npm test' : `${manager} test`);
    if (!scripts.check && scripts.lint) checks.push(run('lint'));
    if (!scripts.check && scripts.typecheck) checks.push(run('typecheck'));
  }
  if (existsSync(join(root, 'Cargo.toml'))) checks.push('cargo test');
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'pytest.ini'))) {
    checks.push('pytest');
  }
  return [...new Set(checks)];
}

function detectDocs(root) {
  return ['README.md', 'docs', 'CHANGELOG.md', 'CONTRIBUTING.md'].filter((entry) =>
    existsSync(join(root, entry)),
  );
}

function cmdInit(flags, positionals) {
  const start = flags.root ? resolve(flags.root) : process.cwd();
  // An explicit --root always wins. Otherwise anchor the ledger at the git
  // root so running `init` from a subdirectory still lands in the right repo.
  const root = flags.root ? start : detectGitRoot(start) || start;
  const paths = ledgerPaths(root);
  const name = String(flag(flags, 'name', positionals.join(' ').trim()) || '').trim();

  ensureDir(paths.base);
  ensureDir(paths.tasks);
  ensureDir(paths.locks);
  ensureDir(paths.runs);
  ensureDir(paths.kb);
  ensureDir(paths.notes);
  ensureDir(paths.decisions);
  ensureDir(paths.bin);
  ensureDir(join(paths.base, 'tmp'));

  const existing = readJson(paths.project, null);
  const project = {
    version: 1,
    name: name || existing?.name || readJson(join(root, 'package.json'), {})?.name || basename(root),
    created_at: existing?.created_at || now(),
    checks: existing?.checks?.length ? existing.checks : detectChecks(root),
    docs: existing?.docs?.length ? existing.docs : detectDocs(root),
    language: 'fr',
  };
  writeJson(paths.project, project);

  writeText(
    join(paths.base, '.gitignore'),
    ['status.json', 'locks/', 'tmp/', ''].join('\n'),
  );

  // The project keeps its own copy of the CLI so the ledger travels with the
  // repository, even on a machine where the plugin is not installed.
  const source = fileURLToPath(import.meta.url);
  const destination = join(paths.bin, 'atelier.mjs');
  if (resolve(source) !== resolve(destination)) {
    try {
      copyFileSync(source, destination);
    } catch (error) {
      process.stderr.write(`atelier: copie du CLI impossible : ${error.message}\n`);
    }
  }

  refresh(root);
  info(`Atelier initialisé dans ${root}`);
  info(`Registre : ${LEDGER}/`);
  if (project.checks.length) info(`Vérifications détectées : ${project.checks.join(' · ')}`);
  info('');
  info('Prochaines étapes :');
  info('  /atelier:plan <objectif>   découper le projet en tâches');
  info('  /atelier:work              exécuter les tâches prêtes');
  info('  /atelier:ticket <titre>    ouvrir un ticket ou un bug');
  info('  /atelier:status            afficher le tableau de bord');
}

// ---------------------------------------------------------------------------
// Task commands

function createTask(root, values) {
  const kind = values.kind || 'task';
  if (!KINDS.includes(kind)) die(`type de tâche inconnu : ${kind} (${KINDS.join(', ')})`);
  const priority = values.priority || 'P2';
  if (!PRIORITIES.includes(priority)) die(`priorité inconnue : ${priority} (${PRIORITIES.join(', ')})`);

  const title = String(values.title || '').trim();
  if (!title) die('titre obligatoire');

  return withIdLock(root, () => {
    const id = nextId(root, kind);
    const tasks = loadTasks(root);
    const byId = new Map(tasks.map((task) => [normaliseId(task.id), task]));
    const dependsOn = splitList(values.depends).map(normaliseId);
    for (const dependency of dependsOn) {
      if (!byId.has(dependency)) die(`dépendance inconnue : ${dependency}`);
    }
    const task = {
      version: 1,
      id,
      title,
      kind,
      type: values.type || DEFAULT_TYPE[kind],
      status: 'todo',
      priority,
      epic: values.epic || null,
      description: values.description || '',
      acceptance: toArray(values.accept).map((text) => ({ text: String(text), done: false })),
      verify: toArray(values.verify).map(String),
      files: splitList(values.files),
      depends_on: dependsOn,
      assignee: null,
      claimed_at: null,
      created_at: now(),
      updated_at: now(),
      done_at: null,
      blocked_reason: null,
      summary: null,
      evidence: [],
      docs: [],
      journal: [{ at: now(), agent: values.agent || 'human', text: 'Tâche créée' }],
    };
    saveTask(root, task);
    return task;
  });
}

function newLike(flags, positionals, defaults = {}) {
  const { root } = requireProject(flags);
  const title = positionals.join(' ').trim();
  if (!title) die('titre obligatoire');
  const task = createTask(root, {
    ...defaults,
    title,
    kind: flag(flags, 'kind', defaults.kind || 'task'),
    type: flag(flags, 'type', defaults.type),
    priority: flag(flags, 'priority', defaults.priority || 'P2'),
    epic: flag(flags, 'epic', defaults.epic),
    description: flag(flags, 'description', ''),
    depends: flag(flags, 'depends', defaults.depends),
    accept: flag(flags, 'accept', defaults.accept),
    verify: flag(flags, 'verify', defaults.verify),
    files: flag(flags, 'files'),
    agent: flag(flags, 'agent', 'human'),
  });
  const status = refresh(root);
  info(`Créée ${task.id} — ${task.title} (${task.kind}, ${task.priority})`);
  if (status) info(`Progression : ${status.done}/${status.total} · ${status.ready.length} prêtes`);
}

function cmdNew(flags, positionals) {
  newLike(flags, positionals, { kind: 'task' });
}

function cmdBug(flags, positionals) {
  const severity = String(flag(flags, 'severity', '')).toLowerCase();
  const priority =
    flag(flags, 'priority') ||
    { critical: 'P0', blocker: 'P0', high: 'P1', medium: 'P2', low: 'P3' }[severity] ||
    'P1';
  newLike(flags, positionals, { kind: 'bug', priority });
}

function cmdTicket(flags, positionals) {
  const severity = String(flag(flags, 'severity', '')).toLowerCase();
  const priority =
    flag(flags, 'priority') ||
    { critical: 'P0', blocker: 'P0', high: 'P1', medium: 'P2', low: 'P3' }[severity] ||
    'P2';
  newLike(flags, positionals, { kind: 'ticket', priority });
}

function printTask(task) {
  info(`${task.id} — ${task.title}`);
  info(`  statut   : ${task.status} (${task.priority}, ${task.kind}/${task.type})`);
  if (task.epic) info(`  épopée   : ${task.epic}`);
  if (task.assignee) info(`  agent    : ${task.assignee}`);
  if (task.depends_on?.length) info(`  dépend   : ${task.depends_on.join(', ')}`);
  if (task.blocked_reason) info(`  bloquée  : ${task.blocked_reason}`);
  if (task.description) info(`  contexte : ${task.description}`);
  info(`  critères :`);
  if (!task.acceptance?.length) info('    (aucun — la tâche ne pourra pas être terminée)');
  for (const [index, item] of (task.acceptance || []).entries()) {
    info(`    ${item.done ? '[x]' : '[ ]'} ${index + 1}. ${item.text}`);
  }
  if (task.verify?.length) info(`  vérifier : ${task.verify.join(' · ')}`);
  if (task.evidence?.length) {
    info(`  preuves  :`);
    for (const item of task.evidence) {
      info(`    ${item.result.toUpperCase()} ${item.command || ''} ${item.note || ''}`.trim());
    }
  }
  if (task.docs?.length) info(`  docs     : ${task.docs.map((item) => item.path).join(', ')}`);
  if (task.summary) info(`  résumé   : ${task.summary}`);
  if (task.journal?.length) {
    info(`  journal  :`);
    for (const entry of task.journal.slice(-8)) {
      info(`    ${entry.at.slice(0, 16).replace('T', ' ')} ${entry.agent}: ${entry.text}`);
    }
  }
}

function cmdList(flags) {
  const { root } = requireProject(flags);
  const all = loadTasks(root);
  const byId = new Map(all.map((task) => [normaliseId(task.id), task]));
  let tasks = all;
  const statuses = splitList(flags.status);
  if (statuses.length) tasks = tasks.filter((task) => statuses.includes(task.status));
  if (flags.kind) tasks = tasks.filter((task) => task.kind === flags.kind);
  if (flags.epic) tasks = tasks.filter((task) => task.epic === flags.epic);
  if (flags.active) tasks = tasks.filter((task) => !['done', 'dropped'].includes(task.status));
  if (flags.ready) tasks = tasks.filter((task) => isReady(root, task, byId));

  tasks = sortTasks(tasks);
  if (flags.json) {
    info(JSON.stringify(tasks, null, 2));
    return;
  }
  if (!tasks.length) {
    info('Aucune tâche.');
    return;
  }
  for (const task of tasks) {
    const agent = task.assignee ? ` · ${task.assignee}` : '';
    const deps = task.depends_on?.length ? ` · dep ${task.depends_on.join(',')}` : '';
    info(`${task.id}  ${task.status.padEnd(11)} ${task.priority}  ${task.title}${agent}${deps}`);
  }
}

function cmdShow(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  if (flags.json) info(JSON.stringify(task, null, 2));
  else printTask(task);
}

function cmdNext(flags) {
  const { root } = requireProject(flags);
  const tasks = loadTasks(root);
  const byId = new Map(tasks.map((task) => [normaliseId(task.id), task]));
  const ready = sortTasks(tasks.filter((task) => isReady(root, task, byId)));
  const limit = numberFlag(flags, 'limit', 5);
  const selected = ready.slice(0, limit);
  if (flags.json) {
    info(JSON.stringify(selected, null, 2));
    return;
  }
  if (!selected.length) {
    info('Aucune tâche prête.');
    return;
  }
  for (const task of selected) info(`${task.id}  ${task.priority}  ${task.title}`);
}

function cmdClaim(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const agent = String(flag(flags, 'agent', 'claude'));
  const byId = new Map(loadTasks(root).map((entry) => [normaliseId(entry.id), entry]));

  if (task.status === 'done' || task.status === 'dropped') {
    die(`${task.id} est déjà ${task.status}`);
  }
  if (!dependenciesSatisfied(task, byId)) {
    die(`${task.id} a des dépendances non terminées : ${task.depends_on.join(', ')}`);
  }
  if (task.status === 'blocked') die(`${task.id} est bloquée : ${task.blocked_reason || 'sans raison'}`);

  const lock = activeLock(root, task.id);
  if (lock && lock.agent !== agent) {
    die(`${task.id} est déjà prise par « ${lock.agent} »`);
  }
  if (!lock) acquireLock(root, task.id, agent);

  if (task.status !== 'in_progress') {
    task.status = 'in_progress';
    task.assignee = agent;
    task.claimed_at = now();
    addJournal(task, `Prise par ${agent}`, agent);
    saveTask(root, task);
  }
  refresh(root);
  info(`${task.id} prise par ${agent}`);
}

function cmdRelease(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  releaseLock(root, task.id);
  if (task.status === 'in_progress') {
    task.status = 'todo';
    task.assignee = null;
    addJournal(task, 'Libérée', String(flag(flags, 'agent', 'human')));
    saveTask(root, task);
  }
  refresh(root);
  info(`${task.id} libérée`);
}

function cmdReview(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  if (task.status !== 'in_progress') die(`${task.id} n'est pas en cours (${task.status})`);
  task.status = 'review';
  const summary = flag(flags, 'summary');
  if (summary) task.summary = String(summary);
  addJournal(task, summary ? `Prête pour vérification : ${summary}` : 'Prête pour vérification',
    String(flag(flags, 'agent', 'implementer')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} en revue`);
}

function cmdReopen(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const reason = flag(flags, 'reason');
  if (!reason) die('--reason obligatoire');
  task.status = 'in_progress';
  task.blocked_reason = null;
  addJournal(task, `Rouverte : ${reason}`, String(flag(flags, 'agent', 'verifier')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} rouverte`);
}

function cmdBlock(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const reason = flag(flags, 'reason');
  if (!reason) die('--reason obligatoire');
  task.status = 'blocked';
  task.blocked_reason = String(reason);
  task.assignee = null;
  addJournal(task, `Bloquée : ${reason}`, String(flag(flags, 'agent', 'human')));
  saveTask(root, task);
  releaseLock(root, task.id);
  refresh(root);
  info(`${task.id} bloquée`);
}

function cmdUnblock(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  if (task.status !== 'blocked') die(`${task.id} n'est pas bloquée`);
  task.status = 'todo';
  task.blocked_reason = null;
  addJournal(task, 'Débloquée', String(flag(flags, 'agent', 'human')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} débloquée`);
}

function cmdDrop(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const reason = flag(flags, 'reason');
  if (!reason) die('--reason obligatoire');
  task.status = 'dropped';
  task.blocked_reason = String(reason);
  addJournal(task, `Abandonnée : ${reason}`, String(flag(flags, 'agent', 'human')));
  saveTask(root, task);
  releaseLock(root, task.id);
  refresh(root);
  info(`${task.id} abandonnée`);
}

function cmdAccept(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const acceptance = Array.isArray(task.acceptance) ? task.acceptance : [];
  if (!acceptance.length) die(`${task.id} n'a aucun critère d'acceptation`);
  const undo = flag(flags, 'undo', false) === true;
  let indexes = [];
  if (flags.all === true) indexes = acceptance.map((_, index) => index);
  else if (flags.index !== undefined) {
    indexes = splitList(flags.index).map((value) => Number(value) - 1);
  }
  if (!indexes.length) die('précisez --index N (1-based) ou --all');
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= acceptance.length) {
      die(`critère hors limites : ${index + 1}`);
    }
    acceptance[index].done = !undo;
  }
  addJournal(
    task,
    `${undo ? 'Décoche' : 'Coche'} critère(s) ${indexes.map((index) => index + 1).join(', ')}`,
    String(flag(flags, 'agent', 'verifier')),
  );
  saveTask(root, task);
  refresh(root);
  info(`${task.id} : ${acceptance.filter((item) => item.done).length}/${acceptance.length} critères`);
}

function cmdEvidence(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const result = String(flag(flags, 'result', 'info')).toLowerCase();
  if (!['pass', 'fail', 'info'].includes(result)) die('--result doit être pass, fail ou info');
  task.evidence = Array.isArray(task.evidence) ? task.evidence : [];
  task.evidence.push({
    at: now(),
    agent: String(flag(flags, 'agent', 'verifier')),
    command: flag(flags, 'command') ? String(flag(flags, 'command')) : null,
    result,
    note: flag(flags, 'note') ? String(flag(flags, 'note')) : null,
  });
  addJournal(task, `Preuve ${result}${flag(flags, 'command') ? ` : ${flag(flags, 'command')}` : ''}`,
    String(flag(flags, 'agent', 'verifier')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} : preuve ${result} enregistrée`);
}

function cmdDoc(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const path = flag(flags, 'path');
  if (!path) die('--path obligatoire');
  task.docs = Array.isArray(task.docs) ? task.docs : [];
  task.docs = task.docs.filter((entry) => entry.path !== path);
  task.docs.push({
    at: now(),
    agent: String(flag(flags, 'agent', 'documenter')),
    path: String(path),
    note: flag(flags, 'note') ? String(flag(flags, 'note')) : null,
  });
  addJournal(task, `Documentation mise à jour : ${path}`, String(flag(flags, 'agent', 'documenter')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} : documentation ${path} enregistrée`);
}

function cmdNote(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const text = positionals.slice(1).join(' ').trim() || flag(flags, 'text');
  if (!text) die('texte obligatoire');
  addJournal(task, String(text), String(flag(flags, 'agent', 'human')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} : note ajoutée`);
}

function cmdSummary(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const text = positionals.slice(1).join(' ').trim() || flag(flags, 'text');
  if (!text) die('résumé obligatoire');
  task.summary = String(text);
  addJournal(task, 'Résumé enregistré', String(flag(flags, 'agent', 'human')));
  saveTask(root, task);
  refresh(root);
  info(`${task.id} : résumé enregistré`);
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolvePromise(data));
    process.stdin.on('error', () => resolvePromise(data));
    process.stdin.resume();
  });
}

async function cmdRun(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  const agent = String(flag(flags, 'agent', 'agent'));
  let content = '';
  if (flags.file) content = readFileSync(String(flags.file), 'utf8');
  else if (flags.text) content = String(flags.text);
  else content = await readStdin();
  if (!content.trim()) die('contenu obligatoire (--file, --text ou stdin)');
  const stamp = now().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const dir = join(root, LEDGER, 'runs', task.id);
  ensureDir(dir);
  const path = join(dir, `${stamp}-${slugify(agent)}.md`);
  writeText(
    path,
    `---\ntask: ${task.id}\nagent: ${agent}\ncreated: ${now()}\n---\n\n${content.trim()}\n`,
  );
  addJournal(task, `Rapport d'agent enregistré : ${path.slice(root.length + 1)}`, agent);
  saveTask(root, task);
  refresh(root);
  info(`Rapport enregistré : ${path}`);
}

function cmdDone(flags, positionals) {
  const { root } = requireProject(flags);
  const task = requireTask(root, positionals[0]);
  if (task.status === 'done') {
    info(`${task.id} est déjà terminée`);
    return;
  }
  const force = flags.force === true;
  const reason = flag(flags, 'reason');
  if (force && !reason) die('--force exige --reason (la dérogation est tracée)');

  const acceptance = Array.isArray(task.acceptance) ? task.acceptance : [];
  const evidence = Array.isArray(task.evidence) ? task.evidence : [];
  const docs = Array.isArray(task.docs) ? task.docs : [];
  const byId = new Map(loadTasks(root).map((entry) => [normaliseId(entry.id), entry]));
  const problems = [];

  if (!acceptance.length) problems.push("aucun critère d'acceptation");
  const unchecked = acceptance.filter((item) => !item.done);
  if (unchecked.length) problems.push(`${unchecked.length} critère(s) non coché(s)`);
  if (!evidence.some((item) => item.result === 'pass')) {
    problems.push('aucune preuve PASS (la vérification doit être exécutée)');
  }
  if (!docs.length) problems.push('aucune documentation mise à jour');
  if (!task.summary && !flag(flags, 'summary')) problems.push('aucun résumé');
  if (!dependenciesSatisfied(task, byId)) problems.push('dépendances non terminées');

  if (problems.length && !force) {
    die(
      `refus de terminer ${task.id} : ${problems.join(' ; ')}.\n` +
        'Corrigez, ou utilisez --force --reason "..." (dérogation tracée).',
    );
  }

  if (flag(flags, 'summary')) task.summary = String(flag(flags, 'summary'));
  task.status = 'done';
  task.done_at = now();
  task.blocked_reason = null;
  task.forced = force || undefined;
  task.force_reason = force ? String(reason) : null;
  addJournal(
    task,
    force ? `Terminée par dérogation : ${reason}` : 'Terminée (critères, preuves et documentation vérifiés)',
    String(flag(flags, 'agent', 'verifier')),
  );
  saveTask(root, task);
  releaseLock(root, task.id);
  const status = refresh(root);
  info(`${task.id} terminée · ${status.done}/${status.total} (${status.progress} %)`);
}

// ---------------------------------------------------------------------------
// Knowledge base

async function cmdKb(flags, positionals) {
  const { root } = requireProject(flags);
  const paths = ledgerPaths(root);
  const sub = positionals[0] || 'list';
  const rest = positionals.slice(1);

  if (sub === 'index') {
    writeText(paths.kbIndex, renderKbIndex(root));
    info(`Index réécrit : ${paths.kbIndex}`);
    return;
  }

  if (sub === 'add') {
    const title = rest.join(' ').trim() || String(flag(flags, 'title', '')).trim();
    if (!title) die('titre obligatoire');
    const kind = String(flag(flags, 'kind', flag(flags, 'type', 'note'))).toLowerCase();
    let content = '';
    if (flags.file) content = readFileSync(String(flags.file), 'utf8');
    else if (flags.text) content = String(flags.text);
    else if (flags.stdin === true) content = await readStdin();
    if (!content.trim()) content = `# ${title}\n`;
    const tags = splitList(flag(flags, 'tags'));
    const related = flag(flags, 'task') ? normaliseId(flag(flags, 'task')) : '';
    const date = now().slice(0, 10);

    let path;
    if (kind === 'decision' || kind === 'adr') {
      ensureDir(paths.decisions);
      const numbers = readdirSync(paths.decisions)
        .map((name) => name.match(/^ADR-(\d+)/))
        .filter(Boolean)
        .map((match) => Number(match[1]));
      const number = numbers.length ? Math.max(...numbers) + 1 : 1;
      path = join(paths.decisions, `ADR-${String(number).padStart(4, '0')}-${slugify(title)}.md`);
    } else {
      ensureDir(paths.notes);
      path = join(paths.notes, `${date}-${slugify(title)}.md`);
      let suffix = 2;
      while (existsSync(path)) {
        path = join(paths.notes, `${date}-${slugify(title)}-${suffix}.md`);
        suffix += 1;
      }
    }

    const frontmatter = [
      '---',
      `title: ${JSON.stringify(title)}`,
      `type: ${kind === 'adr' ? 'decision' : kind}`,
      `created: ${now()}`,
      `tags: [${tags.join(', ')}]`,
    ];
    if (related) frontmatter.push(`task: ${related}`);
    frontmatter.push('---', '', content.trim(), '');
    writeText(path, frontmatter.join('\n'));
    writeText(paths.kbIndex, renderKbIndex(root));
    info(`Note créée : ${path}`);
    return;
  }

  if (sub === 'search') {
    const term = rest.join(' ').trim();
    if (!term) die('terme de recherche obligatoire');
    const needle = fold(term);
    let found = 0;
    for (const entry of noteFiles(root)) {
      const text = readFileSync(entry.path, 'utf8');
      if (!fold(text).includes(needle)) continue;
      found += 1;
      const meta = parseFrontmatter(text);
      const relativePath = entry.path.slice(root.length + 1);
      info(`${relativePath}${meta.title ? ` — ${meta.title}` : ''}`);
      // Prefer a match in the body: a timestamp in the frontmatter is noise.
      const body = text.replace(/^---[\s\S]*?\n---\s*\n?/, '');
      const line =
        body.split(/\r?\n/).find((candidate) => fold(candidate).includes(needle)) ||
        text.split(/\r?\n/).find((candidate) => fold(candidate).includes(needle));
      if (line) info(`  ${line.trim().slice(0, 160)}`);
    }
    if (!found) info('Aucun résultat.');
    return;
  }

  // default: list
  const typeFilter = flag(flags, 'kind', flag(flags, 'type'));
  const tagFilter = flag(flags, 'tag');
  const entries = noteFiles(root).map((entry) => {
    const text = readFileSync(entry.path, 'utf8');
    return { ...entry, meta: parseFrontmatter(text) };
  });
  let shown = 0;
  for (const entry of entries) {
    const type = entry.meta.type || entry.kind;
    if (typeFilter && type !== typeFilter) continue;
    const tags = Array.isArray(entry.meta.tags) ? entry.meta.tags : entry.meta.tags ? [entry.meta.tags] : [];
    if (tagFilter && !tags.includes(String(tagFilter))) continue;
    shown += 1;
    const relativePath = entry.path.slice(root.length + 1);
    info(`${relativePath} — ${entry.meta.title || entry.name} [${type}]`);
  }
  if (!shown) info('Aucune note.');
}

// ---------------------------------------------------------------------------
// Status, context, doctor

function cmdStatus(flags) {
  const { root, project } = requireProject(flags);
  const status = refresh(root);
  if (flags.json) {
    info(JSON.stringify(status, null, 2));
    return;
  }
  if (flags.line) {
    info(status.line);
    return;
  }
  const width = 20;
  const filled = Math.round((status.progress / 100) * width);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
  info(`Atelier — Projet « ${project.name} »`);
  info(`Progression : ${status.done}/${status.total} (${status.progress} %)  ${bar}`);
  if (status.in_progress.length) {
    for (const item of status.in_progress) {
      info(`En cours    : ${item.id} — ${item.title}${item.agent ? ` [${item.agent}]` : ''}`);
    }
  }
  if (status.review.length) {
    info(`En revue    : ${status.review.map((item) => item.id).join(', ')}`);
  }
  if (status.ready.length) info(`Prêtes      : ${status.ready.join(', ')}`);
  if (status.blocked.length) {
    for (const item of status.blocked) {
      info(`Bloquée     : ${item.id} — ${item.title}${item.reason ? ` (${item.reason})` : ''}`);
    }
  }
  if (!status.total) info('Aucune tâche. Lancez `/atelier:plan <objectif>`.');
}

function buildContext(root) {
  const project = readJson(join(root, LEDGER, 'project.json'), null);
  if (!project) return '';
  const status = refresh(root);
  const tasks = loadTasks(root);
  const byId = new Map(tasks.map((task) => [normaliseId(task.id), task]));
  const ready = status.ready.slice(0, 6).map((id) => {
    const task = byId.get(id);
    return task ? `${id} « ${task.title} »` : id;
  });
  const inProgress = status.in_progress
    .map((item) => `${item.id} « ${item.title} »${item.agent ? ` (${item.agent})` : ''}`)
    .join(' · ');
  const blocked = status.blocked
    .slice(0, 4)
    .map((item) => `${item.id}${item.reason ? ` (${item.reason})` : ''}`)
    .join(' · ');
  const notes = noteFiles(root);
  const lastNote = notes.length ? basename(notes[notes.length - 1].name, '.md') : null;

  const lines = [
    '[Atelier] Registre de projet actif.',
    `Projet « ${project.name} » — ${status.done}/${status.total} tâches terminées (${status.progress} %).`,
  ];
  if (inProgress) lines.push(`En cours : ${inProgress}.`);
  if (ready.length) lines.push(`Prêtes : ${ready.join(', ')}.`);
  if (blocked) lines.push(`Bloquées : ${blocked}.`);
  if (notes.length) lines.push(`Base de connaissances : ${notes.length} note(s)${lastNote ? `, dernière « ${lastNote} »` : ''}.`);
  lines.push(
    'Protocole : `/atelier:work` exécute les tâches prêtes avec des sous-agents ; ' +
      '`/atelier:plan <objectif>` découpe ; `/atelier:status` affiche le tableau de bord.',
  );
  lines.push(
    'Garde-fou : une tâche ne peut être terminée qu\'avec critères cochés, preuve PASS et documentation enregistrée.',
  );
  const text = lines.join('\n');
  return text.length > 1800 ? `${text.slice(0, 1790)}…` : text;
}

async function cmdHookSessionStart() {
  try {
    await readStdin();
    const root = findRoot(process.cwd());
    if (!root) {
      process.stdout.write('{}\n');
      return;
    }
    const additionalContext = buildContext(root);
    if (!additionalContext) {
      process.stdout.write('{}\n');
      return;
    }
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`atelier: hook SessionStart ignoré : ${error.message}\n`);
    process.stdout.write('{}\n');
  }
}

async function cmdHookStop() {
  try {
    await readStdin();
    const root = findRoot(process.cwd());
    if (root) refresh(root);
    process.stdout.write('{}\n');
  } catch {
    process.stdout.write('{}\n');
  }
}

function cmdDoctor(flags) {
  const { root, project } = requireProject(flags);
  const tasks = loadTasks(root);
  const byId = new Map(tasks.map((task) => [normaliseId(task.id), task]));
  const errors = [];
  const warnings = [];

  for (const task of tasks) {
    if (!STATUSES.includes(task.status)) errors.push(`${task.id} : statut inconnu « ${task.status} »`);
    if (!PRIORITIES.includes(task.priority)) errors.push(`${task.id} : priorité inconnue « ${task.priority} »`);
    if (!KINDS.includes(task.kind)) errors.push(`${task.id} : type inconnu « ${task.kind} »`);
    for (const dependency of task.depends_on || []) {
      if (!byId.has(normaliseId(dependency))) errors.push(`${task.id} : dépendance absente ${dependency}`);
    }
    if (task.status === 'done') {
      if (task.forced) {
        // --force is the traced escape hatch: record it, do not invalidate the
        // ledger for the very case the escape hatch exists to handle.
        warnings.push(
          `${task.id} : terminée par dérogation${task.force_reason ? ` — ${task.force_reason}` : ''}`,
        );
      } else {
        if (!task.summary) errors.push(`${task.id} : terminée sans résumé`);
        if (!(task.evidence || []).some((item) => item.result === 'pass')) {
          errors.push(`${task.id} : terminée sans preuve PASS`);
        }
        if (!(task.docs || []).length) errors.push(`${task.id} : terminée sans documentation`);
        if ((task.acceptance || []).some((item) => !item.done)) {
          errors.push(`${task.id} : terminée avec des critères non cochés`);
        }
      }
    }
    const lock = activeLock(root, task.id);
    if (lock && task.status !== 'in_progress' && task.status !== 'review') {
      warnings.push(`${task.id} : verrou actif alors que le statut est ${task.status}`);
    }
  }

  // Cycle detection over dependencies.
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visiting.has(id)) {
      errors.push(`cycle de dépendances : ${[...stack, id].join(' → ')}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const task = byId.get(id);
    for (const dependency of task?.depends_on || []) visit(normaliseId(dependency), [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(normaliseId(task.id), []);

  if (!project.name) errors.push('project.json : nom manquant');

  if (errors.length) {
    info(`Atelier — ${project.name} : ${errors.length} erreur(s), ${warnings.length} avertissement(s)`);
    for (const error of errors) info(`  ERREUR ${error}`);
    for (const warning of warnings) info(`  ATTENTION ${warning}`);
    process.exit(1);
  }
  info(`Atelier — ${project.name} : registre sain (${tasks.length} tâche(s)).`);
  for (const warning of warnings) info(`  ATTENTION ${warning}`);
}

// ---------------------------------------------------------------------------
// Help

function usage() {
  info(`Atelier ${VERSION} — registre de projet pour Claude Code`);
  info('');
  info('Usage : atelier <commande> [options]');
  info('');
  info('Projet');
  info('  init [nom]                    initialise .atelier/ dans le dépôt');
  info('  status [--json|--line]        tableau de bord et statut compact');
  info('  render                        régénère plan.md, status.json et l’index KB');
  info('  doctor                        valide le registre et les dépendances');
  info('');
  info('Tâches');
  info('  new <titre> [--accept ...] [--depends ...] [--priority P1] [--epic E-01]');
  info('  ticket <titre> [--severity high]   ouvre un ticket');
  info('  bug <titre> [--severity high]      ouvre un bug');
  info('  list [--ready] [--status todo] [--json]');
  info('  show <id> [--json]');
  info('  next [--limit 5] [--json]');
  info('  claim <id> --agent <nom>      verrouille et démarre une tâche');
  info('  review <id> --summary "..."   passe en revue');
  info('  accept <id> --index 1|--all [--undo]');
  info('  evidence <id> --result pass|fail|info [--command ...] [--note ...]');
  info('  doc <id> --path <fichier> [--note ...]');
  info('  note <id> <texte>');
  info('  summary <id> <texte>');
  info('  run <id> --agent <nom> (--file|--text|stdin)');
  info('  done <id> [--summary ...] [--force --reason ...]');
  info('  block|unblock|drop|reopen|release <id> ...');
  info('');
  info('Base de connaissances');
  info('  kb add <titre> [--kind note|decision|research] [--tags a,b] [--file ...]');
  info('  kb list [--kind ...] [--tag ...]');
  info('  kb search <terme>');
  info('  kb index');
}

// ---------------------------------------------------------------------------
// Dispatch

const commands = {
  init: cmdInit,
  new: cmdNew,
  ticket: cmdTicket,
  bug: cmdBug,
  list: cmdList,
  show: cmdShow,
  next: cmdNext,
  claim: cmdClaim,
  release: cmdRelease,
  review: cmdReview,
  reopen: cmdReopen,
  block: cmdBlock,
  unblock: cmdUnblock,
  drop: cmdDrop,
  accept: cmdAccept,
  evidence: cmdEvidence,
  doc: cmdDoc,
  note: cmdNote,
  summary: cmdSummary,
  run: cmdRun,
  done: cmdDone,
  render: (flags) => {
    const { root } = requireProject(flags);
    const status = refresh(root);
    info(`Rendu : plan.md, status.json, kb/index.md · ${status.done}/${status.total}`);
  },
  status: cmdStatus,
  doctor: cmdDoctor,
  kb: cmdKb,
  version: () => info(VERSION),
};

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }
  if (command === 'hook-session-start' || command === 'hook-stop') {
    const { flags } = parseArgs(argv.slice(1));
    if (flags.root) process.env.ATELIER_ROOT = flags.root;
    if (command === 'hook-session-start') await cmdHookSessionStart();
    else await cmdHookStop();
    return;
  }
  if (command === 'context') {
    const root = findRoot(process.cwd());
    if (!root) {
      info('{}');
      return;
    }
    info(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: buildContext(root) },
      }),
    );
    return;
  }
  const handler = commands[command];
  if (!handler) die(`commande inconnue « ${command} ». Voir \`atelier help\`.`);
  const { flags, positionals } = parseArgs(argv.slice(1));
  await handler(flags, positionals);
}

main().catch((error) => {
  die(error?.stack || String(error));
});
