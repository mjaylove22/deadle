// Deadle — daily Deadlock hero guesser. Pure logic on top, DOM wiring at the bottom.
const LAUNCH = Date.UTC(2026, 9, 22); // day 1 = 2026-10-22 UTC. Never change: it shifts every past answer.
const ATTRS = [
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'type', label: 'Type' },
  { key: 'weapon', label: 'Weapon traits' },
  { key: 'range', label: 'Range' },
  { key: 'year', label: 'Release year' },
  { key: 'health', label: 'Base health' },
  { key: 'clip', label: 'Clip size' },
];

const dayIndex = (now = Date.now()) => Math.max(0, Math.floor((now - LAUNCH) / 864e5));
const isoDate = (day) => new Date(LAUNCH + day * 864e5).toISOString().slice(0, 10);

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, seed) {
  const a = [...list], rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Days are split into cycles; each cycle is a seeded shuffle of the roster as it stood when the cycle began,
// so nobody repeats within a cycle. A new hero gets `"added": "YYYY-MM-DD"` (today or later, never backdated)
// and joins the first cycle starting on/after that date, so past answers never move.
// ponytail: removing or renaming a hero DOES rewrite history; mark it `"retired"` instead if that ever happens.
function answerFor(day, heroes) {
  for (let start = 0, cycle = 0; ; cycle++) {
    const pool = heroes
      .filter((h) => !h.added || h.added <= isoDate(start))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    if (day < start + pool.length) return shuffle(pool, 0xdead + cycle)[day - start];
    start += pool.length;
  }
}

// One result per attribute: status 'green' | 'yellow' | 'red', and arrow '↑'/'↓' (answer is higher/lower) for numbers.
function compare(guess, answer) {
  return ATTRS.map(({ key, label }) => {
    const g = guess[key], a = answer[key];
    let status = 'red', arrow = '';
    if (Array.isArray(g)) {
      const hits = g.filter((x) => a.includes(x)).length;
      if (hits === g.length && hits === a.length) status = 'green';
      else if (hits) status = 'yellow';
    } else if (g === a) status = 'green';
    else if (typeof g === 'number') arrow = a > g ? '↑' : '↓';
    return { key, label, value: Array.isArray(g) ? g.join(', ') || 'None' : String(g), status, arrow };
  });
}

const EMOJI = { green: '🟩', yellow: '🟨', red: '🟥' };
const shareText = (day, rows) =>
  `Deadle #${day + 1} — solved in ${rows.length} ${rows.length === 1 ? 'guess' : 'guesses'}\n` +
  rows.map((r) => r.map((c) => EMOJI[c.status]).join('')).join('\n');

if (typeof module !== 'undefined') module.exports = { answerFor, compare, shareText, dayIndex };

// ---------- browser ----------
if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('deadle')) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem('deadle', JSON.stringify(v)); } catch { /* blocked storage: game still works, just won't persist */ } },
  };

  fetch('heroes.json').then((r) => r.json()).then(start).catch(() => {
    $('status').textContent = 'Could not load heroes.json. Serve this folder over HTTP (see README).';
  });

  function start(heroes) {
    const day = dayIndex();
    const answer = answerFor(day, heroes);
    const byName = new Map(heroes.map((h) => [h.name.toLowerCase(), h]));
    let save = store.get();
    if (save.day !== day) save = { ...save, day, guesses: [] };
    save.guesses = save.guesses.filter((n) => byName.has(n.toLowerCase())); // drop names no longer in the roster
    const won = () => save.guesses.includes(answer.name);

    $('day').textContent = `#${day + 1}`;
    if (day > 0) $('yesterday').textContent = `Yesterday's hero was ${answerFor(day - 1, heroes).name}.`;

    const input = $('guess'), list = $('options');
    let active = -1, matches = [];

    function render() {
      const body = $('rows');
      body.innerHTML = '';
      for (const name of [...save.guesses].reverse()) {
        const hero = byName.get(name.toLowerCase());
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = hero.name;
        tr.append(th);
        for (const c of compare(hero, answer)) {
          const td = document.createElement('td');
          td.className = c.status;
          td.textContent = c.value + (c.arrow ? ' ' + c.arrow : '');
          const verdict = { green: 'correct', yellow: 'partial match', red: 'wrong' }[c.status];
          const hint = c.arrow ? (c.arrow === '↑' ? ', answer is higher' : ', answer is lower') : '';
          td.setAttribute('aria-label', `${c.label}: ${c.value}, ${verdict}${hint}`);
          tr.append(td);
        }
        body.append(tr);
      }
      $('board').hidden = !save.guesses.length;
      const done = won();
      input.disabled = $('submit').disabled = done;
      $('win').hidden = !done;
      if (done) $('win-text').textContent = `You got ${answer.name} in ${save.guesses.length} ${save.guesses.length === 1 ? 'guess' : 'guesses'}!`;
      const streak = save.lastWin >= day - 1 ? save.streak || 0 : 0;
      $('streak').textContent = `Streak: ${streak} · Best: ${save.best || 0}`;
    }

    function showOptions() {
      const q = input.value.trim().toLowerCase();
      matches = q ? heroes.filter((h) => h.name.toLowerCase().includes(q) && !save.guesses.includes(h.name))
        .sort((a, b) => b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) : [];
      active = matches.length ? 0 : -1;
      drawOptions();
    }

    function drawOptions() {
      if (!matches.length) active = -1;
      list.innerHTML = '';
      matches.forEach((h, i) => {
        const li = document.createElement('li');
        li.id = 'opt-' + i;
        li.setAttribute('role', 'option');
        li.textContent = h.name;
        li.setAttribute('aria-selected', i === active);
        li.addEventListener('mousedown', (e) => { e.preventDefault(); submit(h.name); });
        list.append(li);
      });
      list.hidden = !matches.length;
      input.setAttribute('aria-expanded', !list.hidden);
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', 'opt-' + active);
        list.children[active].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }

    function submit(name) {
      const hero = byName.get(name.trim().toLowerCase());
      if (!hero) return void ($('status').textContent = 'Pick a hero from the list.');
      if (save.guesses.includes(hero.name)) return void ($('status').textContent = `Already guessed ${hero.name}.`);
      save.guesses.push(hero.name);
      if (hero === answer) {
        save.streak = save.lastWin === day - 1 ? (save.streak || 0) + 1 : 1;
        save.best = Math.max(save.best || 0, save.streak);
        save.lastWin = day;
      }
      store.set(save);
      input.value = '';
      matches = [];
      drawOptions();
      $('status').textContent = hero === answer ? 'Correct!' : `${hero.name} is not it.`;
      render();
      if (hero === answer) $('share').focus(); else input.focus();
    }

    input.addEventListener('input', showOptions);
    input.addEventListener('blur', () => { matches = []; drawOptions(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!matches.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        drawOptions();
      } else if (e.key === 'Escape') { matches = []; drawOptions(); }
    });
    $('form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit(active >= 0 ? matches[active].name : input.value);
    });
    $('share').addEventListener('click', () => {
      const text = shareText(day, save.guesses.map((n) => compare(byName.get(n.toLowerCase()), answer))) + '\n' + location.href;
      navigator.clipboard.writeText(text)
        .then(() => ($('status').textContent = 'Copied to clipboard!'))
        .catch(() => window.prompt('Copy your result:', text));
    });

    render();
  }
}
