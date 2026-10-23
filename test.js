// Run: node test.js
const assert = require('assert');
const fs = require('fs');
const { MODES, answerFor, dailyAnswer, compare, shareText, isoDate, slug } = require('./app.js');
const heroes = require('./heroes.json');
const N = heroes.length;

// Every hero is the answer exactly once per cycle, and the pick is deterministic.
const cycle = Array.from({ length: N }, (_, d) => answerFor(d, heroes).name);
assert.strictEqual(new Set(cycle).size, N, 'no repeats within a cycle');
assert.deepStrictEqual(Array.from({ length: N }, (_, d) => answerFor(d, heroes).name), cycle, 'deterministic');

// Adding a hero (dated in the future) must not change any earlier day.
const later = [...heroes, { name: 'Newcomer', added: '2027-06-01' }];
for (let d = 0; d < 400; d++) {
  if (isoDate(d) >= '2027-06-01') break;
  assert.strictEqual(answerFor(d, later).name, answerFor(d, heroes).name, `day ${d} unchanged`);
}
assert.ok(Array.from({ length: 200 }, (_, i) => answerFor(400 + i, later).name).includes('Newcomer'), 'newcomer joins later');

// Every mode: no repeats within its pool's cycle, and a different daily order than classic.
for (const mode of Object.keys(MODES)) {
  const pool = heroes.filter(MODES[mode].has);
  const picks = Array.from({ length: pool.length }, (_, d) => dailyAnswer(d, heroes, mode).name);
  assert.strictEqual(new Set(picks).size, pool.length, `${mode}: no repeats`);
  if (mode !== 'classic') assert.notDeepStrictEqual(picks.slice(0, 10), cycle.slice(0, 10), `${mode}: own daily order`);
}

// Every asset a mode can show exists on disk.
for (const h of heroes) {
  assert.ok(fs.existsSync(`img/hero/${slug(h.name)}.png`), `${h.name}: portrait`);
  for (const a of h.abilities) assert.ok(fs.existsSync(`img/ability/${slug(a)}.png`), `${h.name}: icon for ${a}`);
  for (const q of h.quotes) if (q.audio) assert.ok(fs.existsSync(q.audio), `${h.name}: ${q.audio}`);
  if (MODES.splash.has(h)) assert.ok(fs.existsSync(h.splash), `${h.name}: ${h.splash}`);
}

// Comparison: exact / partial / miss / arrows.
const a = { pronouns: 'He/Him', type: 'Brawler', weapon: ['Rapid Fire', 'Spreadshot'], range: 'Close', year: 2025, health: 800, clip: 20 };
const g = { pronouns: 'He/Him', type: 'Mystic', weapon: ['Spreadshot'], range: 'Close', year: 2024, health: 900, clip: 20 };
const r = Object.fromEntries(compare(g, a).map((c) => [c.key, c]));
assert.strictEqual(r.pronouns.status, 'green');
assert.strictEqual(r.type.status, 'red');
assert.strictEqual(r.weapon.status, 'yellow');
assert.strictEqual(r.year.arrow, '↑');
assert.strictEqual(r.health.arrow, '↓');
assert.strictEqual(r.clip.status, 'green');
assert.strictEqual(compare(a, a).every((c) => c.status === 'green'), true);
assert.strictEqual(compare({ ...a, weapon: [] }, { ...a, weapon: [] })[2].value, 'None');

// Share text never contains the hero name.
const abrams = heroes.find((h) => h.name === 'Abrams');
assert.ok(!shareText(0, 'classic', [compare(abrams, abrams).map((c) => c.status)]).includes('Abrams'));
assert.strictEqual(shareText(0, 'emoji', [['red'], ['green']]).split('\n')[1], '🟥🟩');

console.log(`ok — ${N} heroes, ${Object.keys(MODES).length} modes, all assets present`);
