// Run: node test.js
const assert = require('assert');
const { answerFor, compare, shareText } = require('./app.js');
const heroes = require('./heroes.json');
const N = heroes.length;

// Every hero is the answer exactly once per cycle, and the pick is deterministic.
const cycle = Array.from({ length: N }, (_, d) => answerFor(d, heroes).name);
assert.strictEqual(new Set(cycle).size, N, 'no repeats within a cycle');
assert.deepStrictEqual(Array.from({ length: N }, (_, d) => answerFor(d, heroes).name), cycle, 'deterministic');

// Adding a hero (dated in the future) must not change any earlier day.
const later = [...heroes, { name: 'Newcomer', added: '2027-06-01' }];
for (let d = 0; d < 400; d++) {
  if (new Date(Date.UTC(2026, 9, 22) + d * 864e5).toISOString().slice(0, 10) >= '2027-06-01') break;
  assert.strictEqual(answerFor(d, later).name, answerFor(d, heroes).name, `day ${d} unchanged`);
}
assert.ok(Array.from({ length: 200 }, (_, i) => answerFor(400 + i, later).name).includes('Newcomer'), 'newcomer joins later');

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
assert.ok(!shareText(0, [compare(abrams, abrams)]).includes('Abrams'));

console.log(`ok — ${N} heroes, today's cycle has no repeats`);
