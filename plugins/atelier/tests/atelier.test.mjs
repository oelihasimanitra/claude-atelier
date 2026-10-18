import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = resolve(fileURLToPath(new URL('../scripts/atelier.mjs', import.meta.url)));

function run(cwd, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-test-'));
  mkdirSync(join(dir, 'project'), { recursive: true });
  const root = join(dir, 'project');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, root };
}

function init(root, name = 'demo') {
  const result = run(root, 'init', '--root', root, '--name', name);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function addTask(root, title, extra = []) {
  const result = run(root, 'new', title, '--root', root, ...extra);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.match(/\b[TBRQDC]-\d{4}\b/)[0];
}

function complete(root, id, summary = 'Fait et vérifié') {
  for (const [command, args] of [
    ['claim', ['--agent', 'implementer']],
    ['accept', ['--all']],
    ['evidence', ['--result', 'pass', '--command', 'npm test', '--note', 'tests verts']],
    ['doc', ['--path', 'README.md', '--note', 'section mise à jour']],
    ['summary', [summary]],
    ['done', ['--summary', summary]],
  ]) {
    const result = run(root, command, id, '--root', root, ...args);
    assert.equal(result.status, 0, `${command} ${id}: ${result.stderr}`);
  }
}

test('init crée un registre complet et une copie locale du CLI', (t) => {
  const { root } = workspace(t);
  init(root, 'Projet démo');

  assert.ok(existsSync(join(root, '.atelier', 'project.json')));
  assert.ok(existsSync(join(root, '.atelier', 'plan.md')));
  assert.ok(existsSync(join(root, '.atelier', 'status.json')));
  assert.ok(existsSync(join(root, '.atelier', 'kb', 'index.md')));
  assert.ok(existsSync(join(root, '.atelier', 'bin', 'atelier.mjs')));

  const plan = readFileSync(join(root, '.atelier', 'plan.md'), 'utf8');
  assert.match(plan, /Généré par/);
  assert.match(plan, /Projet démo|demo/);
});

test('--root explicite gagne sur la racine git (régression)', (t) => {
  const { dir, root } = workspace(t);
  const result = run(dir, 'init', '--root', root, '--name', 'isole');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(root, '.atelier', 'project.json')));
  assert.ok(!existsSync(join(dir, '.atelier', 'project.json')));
});

test('les identifiants suivent le type : tâche, bug, ticket', (t) => {
  const { root } = workspace(t);
  init(root);
  assert.match(addTask(root, 'Une tâche'), /^T-/);
  const bug = run(root, 'bug', 'Un bug', '--root', root, '--severity', 'high');
  assert.equal(bug.status, 0, bug.stderr);
  assert.match(bug.stdout, /\bB-\d{4}\b/);
  const ticket = run(root, 'ticket', 'Une demande', '--root', root);
  assert.equal(ticket.status, 0, ticket.stderr);
  assert.match(ticket.stdout, /\bQ-\d{4}\b/);
});

test('une dépendance non terminée interdit la prise de tâche', (t) => {
  const { root } = workspace(t);
  init(root);
  const first = addTask(root, 'Première', ['--accept', 'A']);
  const second = addTask(root, 'Seconde', ['--accept', 'B', '--depends', first]);

  const blocked = run(root, 'claim', second, '--root', root, '--agent', 'impl');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /dépendances non terminées/);

  complete(root, first);
  const allowed = run(root, 'claim', second, '--root', root, '--agent', 'impl');
  assert.equal(allowed.status, 0, allowed.stderr);
});

test('le verrou empêche deux agents de prendre la même tâche', (t) => {
  const { root } = workspace(t);
  init(root);
  const id = addTask(root, 'Tâche unique', ['--accept', 'A']);
  assert.equal(run(root, 'claim', id, '--root', root, '--agent', 'agent-a').status, 0);
  const second = run(root, 'claim', id, '--root', root, '--agent', 'agent-b');
  assert.equal(second.status, 1);
  assert.match(second.stderr, /déjà prise/);
});

test('done refuse une tâche sans critères, preuve, documentation ni résumé', (t) => {
  const { root } = workspace(t);
  init(root);
  const id = addTask(root, 'Incomplète', ['--accept', 'A']);
  assert.equal(run(root, 'claim', id, '--root', root, '--agent', 'impl').status, 0);

  const refused = run(root, 'done', id, '--root', root);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /critère/);
  assert.match(refused.stderr, /preuve PASS/);
  assert.match(refused.stderr, /documentation/);
  assert.match(refused.stderr, /résumé/);

  // Release the test's lock so the helper can claim under its own agent name.
  assert.equal(run(root, 'release', id, '--root', root).status, 0);
  complete(root, id);
  const task = JSON.parse(readFileSync(join(root, '.atelier', 'tasks', `${id}.json`), 'utf8'));
  assert.equal(task.status, 'done');
  assert.ok(task.done_at);
  assert.equal(task.evidence[0].result, 'pass');
});

test('--force termine avec une dérogation tracée, acceptée par doctor', (t) => {
  const { root } = workspace(t);
  init(root);
  const id = addTask(root, 'Urgence', ['--accept', 'A']);
  run(root, 'claim', id, '--root', root, '--agent', 'impl');

  const noReason = run(root, 'done', id, '--root', root, '--force');
  assert.equal(noReason.status, 1);
  assert.match(noReason.stderr, /--reason/);

  const forced = run(root, 'done', id, '--root', root, '--force', '--reason', 'correctif urgent');
  assert.equal(forced.status, 0, forced.stderr);
  const task = JSON.parse(readFileSync(join(root, '.atelier', 'tasks', `${id}.json`), 'utf8'));
  assert.equal(task.forced, true);
  assert.equal(task.force_reason, 'correctif urgent');

  const doctor = run(root, 'doctor', '--root', root);
  assert.equal(doctor.status, 0, doctor.stdout);
  assert.match(doctor.stdout, /dérogation/);
});

test('status et plan reflètent la progression', (t) => {
  const { root } = workspace(t);
  init(root);
  const id = addTask(root, 'Visible dans le plan', ['--accept', 'A', '--priority', 'P1']);
  complete(root, id);

  const status = run(root, 'status', '--root', root, '--json');
  assert.equal(status.status, 0, status.stderr);
  const data = JSON.parse(status.stdout);
  assert.equal(data.total, 1);
  assert.equal(data.done, 1);
  assert.equal(data.progress, 100);
  assert.match(data.line, /terminé/);

  const line = run(root, 'status', '--root', root, '--line');
  assert.equal(line.stdout.trim(), data.line);

  const plan = readFileSync(join(root, '.atelier', 'plan.md'), 'utf8');
  assert.match(plan, /Visible dans le plan/);
  assert.match(plan, /\[x\]/);
});

test('la base de connaissances accepte les tags et se recherche (régression)', (t) => {
  const { root } = workspace(t);
  init(root);

  const decision = run(
    root,
    'kb', 'add', 'Choix du stockage',
    '--root', root,
    '--kind', 'decision',
    '--tags', 'architecture,stockage',
    '--text', 'Les tâches vivent en JSON versionné. Identifiant 83.',
  );
  assert.equal(decision.status, 0, decision.stderr);

  const note = run(
    root,
    'kb', 'add', 'Note de recherche',
    '--root', root,
    '--tags', 'api',
    '--text', 'Le corps contient le terme unique zébulon.',
  );
  assert.equal(note.status, 0, note.stderr);

  const list = run(root, 'kb', 'list', '--root', root);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /Choix du stockage/);
  assert.match(list.stdout, /Note de recherche/);
  assert.ok(!list.stdout.includes(root), 'les chemins doivent être relatifs');

  const search = run(root, 'kb', 'search', 'zébulon', '--root', root);
  assert.equal(search.status, 0, search.stderr);
  assert.match(search.stdout, /corps contient/);

  const index = readFileSync(join(root, '.atelier', 'kb', 'index.md'), 'utf8');
  assert.match(index, /## Décisions/);
  assert.match(index, /## Notes/);
  assert.match(index, /#architecture/);
});

test('context produit un JSON de hook valide, et rien hors projet', (t) => {
  const { dir, root } = workspace(t);
  init(root);
  addTask(root, 'Contexte', ['--accept', 'A']);

  const inside = run(root, 'context');
  assert.equal(inside.status, 0, inside.stderr);
  const payload = JSON.parse(inside.stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(payload.hookSpecificOutput.additionalContext, /Contexte/);
  assert.match(payload.hookSpecificOutput.additionalContext, /garde-fou/i);

  const outside = join(dir, 'outside');
  mkdirSync(outside);
  const none = run(outside, 'context');
  assert.equal(none.status, 0, none.stderr);
  assert.equal(JSON.parse(none.stdout).hookSpecificOutput, undefined);
});

test('le registre est trouvé depuis un sous-dossier', (t) => {
  const { root } = workspace(t);
  init(root, 'depuis-sous-dossier');
  const nested = join(root, 'src', 'profond');
  mkdirSync(nested, { recursive: true });
  const result = run(nested, 'status');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /depuis-sous-dossier/);
});

test('doctor signale une dépendance absente et un cycle', (t) => {
  const { root } = workspace(t);
  init(root);
  const first = addTask(root, 'A', ['--accept', 'A']);
  const second = addTask(root, 'B', ['--accept', 'B', '--depends', first]);

  const path = join(root, '.atelier', 'tasks', `${first}.json`);
  const task = JSON.parse(readFileSync(path, 'utf8'));
  task.depends_on = [second];
  writeFileSync(path, `${JSON.stringify(task, null, 2)}\n`, 'utf8');

  const doctor = run(root, 'doctor', '--root', root);
  assert.equal(doctor.status, 1);
  assert.match(doctor.stdout, /cycle de dépendances/);

  const missingPath = join(root, '.atelier', 'tasks', `${second}.json`);
  const missing = JSON.parse(readFileSync(missingPath, 'utf8'));
  missing.depends_on = ['T-9999'];
  writeFileSync(missingPath, `${JSON.stringify(missing, null, 2)}\n`, 'utf8');
  const secondDoctor = run(root, 'doctor', '--root', root);
  assert.equal(secondDoctor.status, 1);
  assert.match(secondDoctor.stdout, /dépendance absente/);
});
