// Urndle — daily Deadlock hero guesser. Pure logic on top, DOM wiring at the bottom.
const LAUNCH = Date.UTC(2026, 9, 23); // day 1 = 2026-10-23 UTC. Never change after launch: it shifts every past answer.
const ATTRS = [
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'type', label: 'Type' },
  { key: 'weapon', label: 'Weapon traits' },
  { key: 'range', label: 'Range' },
  { key: 'year', label: 'Release year' },
  { key: 'health', label: 'Base health' },
  { key: 'clip', label: 'Clip size' },
];
// Each mode has its own daily hero (salt) and only picks heroes that have its data (has).
// Never change a salt after launch. classic must stay 0.
const MODES = {
  classic: { label: 'Classic', icon: '🔤', salt: 0, has: () => true },
  quote: { label: 'Quote', icon: '💬', salt: 1, has: (h) => h.quotes?.length > 0 },
  ability: { label: 'Ability', icon: '✨', salt: 2, has: (h) => h.abilities?.length > 0 },
  emoji: { label: 'Emoji', icon: '😀', salt: 3, has: (h) => Array.isArray(h.emoji) },
  splash: { label: 'Splash', icon: '🖼️', salt: 4, has: (h) => !!h.splash && h.splash !== 'TODO' },
};

const dayIndex = (now = Date.now()) => Math.max(0, Math.floor((now - LAUNCH) / 864e5));
const isoDate = (day) => new Date(LAUNCH + day * 864e5).toISOString().slice(0, 10);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
// ponytail: removing or renaming a hero, or a hero gaining data for a mode it lacked (MODES.has), DOES rewrite
// that mode's history. Fill data gaps before launch; after launch, give such heroes a future `added` date.
function answerFor(day, heroes, salt = 0) {
  for (let start = 0, cycle = 0; ; cycle++) {
    const pool = heroes
      .filter((h) => !h.added || h.added <= isoDate(start))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    if (day < start + pool.length) return shuffle(pool, 0xdead + cycle + salt * 7919)[day - start];
    start += pool.length;
  }
}
const dailyAnswer = (day, heroes, mode) => answerFor(day, heroes.filter(MODES[mode].has), MODES[mode].salt);
// Seeded per-day randomness for a mode: which quote/ability, splash focus point, icon rotation.
const dailyRand = (day, mode) => mulberry32(day * 1009 + MODES[mode].salt);

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
// rows: one array of statuses per guess (classic: 7 per guess, other modes: 1).
function shareText(day, mode, rows) {
  const m = MODES[mode], n = rows.length;
  const grid = mode === 'classic'
    ? rows.map((r) => r.map((s) => EMOJI[s]).join('')).join('\n')
    : rows.map((r) => EMOJI[r[0]]).join('');
  return `Urndle #${day + 1} ${m.icon} ${m.label} — solved in ${n} ${n === 1 ? 'guess' : 'guesses'}\n${grid}`;
}

if (typeof module !== 'undefined') module.exports = { MODES, answerFor, dailyAnswer, dailyRand, compare, shareText, dayIndex, isoDate, slug };

// ---------- browser ----------
if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* blocked storage: game still works, just won't persist */ } },
  };
  const storeKey = (mode) => (mode === 'classic' ? 'urndle' : 'urndle:' + mode);
  const plural = (n) => `${n} ${n === 1 ? 'guess' : 'guesses'}`;
  const portrait = (name, size) => el('img', { src: `img/hero/${slug(name)}.png`, alt: '', width: size, height: size });

  fetch('heroes.json').then((r) => r.json()).then(start).catch(() => {
    $('status').textContent = 'Could not load heroes.json. Serve this folder over HTTP (see README).';
  });

  function start(heroes) {
    const day = dayIndex();
    const byName = new Map(heroes.map((h) => [h.name.toLowerCase(), h]));
    const input = $('guess'), list = $('options');
    let mode, answer, save, active = -1, matches = [];
    const won = () => save.guesses.includes(answer.name);

    function load() {
      mode = MODES[location.hash.slice(1)] ? location.hash.slice(1) : 'classic';
      answer = dailyAnswer(day, heroes, mode);
      save = store.get(storeKey(mode));
      if (save.day !== day) save = { ...save, day, guesses: [] };
      save.guesses = save.guesses.filter((n) => byName.has(n.toLowerCase())); // drop names no longer in the roster
      $('day').textContent = `#${day + 1}`;
      $('yesterday').textContent = day > 0 ? `Yesterday's ${MODES[mode].label} hero was ${dailyAnswer(day - 1, heroes, mode).name}.` : '';
      $('status').textContent = '';
      input.value = '';
      matches = [];
      drawOptions();
      render();
    }

    function renderNav() {
      $('modes').replaceChildren(...Object.entries(MODES).map(([key, m]) => {
        const s = store.get(storeKey(key));
        const solved = s.day === day && (s.guesses || []).includes(dailyAnswer(day, heroes, key).name);
        const a = el('a', { href: '#' + key, className: solved ? 'solved' : '' },
          el('span', { className: 'badge', textContent: m.icon, ariaHidden: 'true' }),
          el('span', { className: 'name', textContent: m.label }));
        if (solved) a.setAttribute('aria-label', `${m.label}, solved today`);
        if (key === mode) a.setAttribute('aria-current', 'page');
        return a;
      }));
    }

    // The clue for non-classic modes. misses = wrong guesses so far; each one reveals a bit more.
    function renderClue(misses, done) {
      const rand = dailyRand(day, mode);
      const clue = $('clue');
      if (mode === 'quote') {
        const q = answer.quotes[Math.floor(rand() * answer.quotes.length)];
        const unlock = done || misses >= 3;
        clue.replaceChildren(
          el('p', { className: 'prompt', textContent: 'Which hero says…' }),
          el('blockquote', { textContent: `“${q.text}”` }),
          unlock && q.audio
            ? el('audio', { controls: true, src: q.audio, preload: 'none', ariaLabel: 'Voice line audio' })
            : el('p', { className: 'hint', textContent: `🔊 Voice line unlocks after ${3 - misses} more wrong ${3 - misses === 1 ? 'guess' : 'guesses'}.` }),
        );
      } else if (mode === 'ability') {
        const ability = answer.abilities[Math.floor(rand() * answer.abilities.length)];
        const turn = [90, 180, 270][Math.floor(rand() * 3)];
        const upright = done || misses >= 3;
        clue.replaceChildren(
          el('p', { className: 'prompt', textContent: 'Which hero has this ability?' }),
          el('div', { className: 'ability' }, el('img', {
            src: `img/ability/${slug(ability)}.png`, alt: done ? ability : 'Mystery ability icon', width: 128, height: 128,
            style: `transform: rotate(${upright ? 0 : turn}deg)`,
          })),
          el('p', { className: 'hint', textContent: done ? `It's ${answer.name}'s ${ability}.` : upright ? 'Icon is now upright.' : `Icon turns upright after ${3 - misses} more wrong ${3 - misses === 1 ? 'guess' : 'guesses'}.` }),
        );
      } else if (mode === 'emoji') {
        const shown = done ? answer.emoji.length : Math.min(misses + 1, answer.emoji.length);
        clue.replaceChildren(
          el('p', { className: 'prompt', textContent: 'Which hero do these emoji describe?' }),
          el('p', { className: 'emoji', ariaLabel: `Emoji clues: ${answer.emoji.slice(0, shown).join(' ')}` },
            ...answer.emoji.map((e, i) => el('span', { textContent: i < shown ? e : '❔', ariaHidden: 'true' }))),
          el('p', { className: 'hint', textContent: shown < answer.emoji.length ? 'One more emoji per wrong guess.' : 'All emoji revealed.' }),
        );
      } else if (mode === 'splash') {
        const x = 25 + rand() * 50, y = 15 + rand() * 40; // focus point, biased toward the upper half where faces are
        const zoom = done ? 1 : Math.max(1.25, 4 - misses * 0.5);
        clue.replaceChildren(
          el('p', { className: 'prompt', textContent: 'Which hero is in this art?' }),
          el('div', { className: 'splash' }, el('img', {
            src: answer.splash, alt: done ? `${answer.name} art` : 'Zoomed-in hero art',
            style: `transform: scale(${zoom}); transform-origin: ${x}% ${y}%`,
          })),
          el('p', { className: 'hint', textContent: done ? '' : 'Zooms out with each wrong guess.' }),
        );
      }
    }

    function render(animate = false) {
      renderNav();
      const done = won();
      const misses = save.guesses.filter((n) => n !== answer.name).length;
      const classic = mode === 'classic';
      $('intro').textContent = classic
        ? "Guess today's Deadlock hero from their attributes."
        : `${MODES[mode].label} mode: guess the hero from the clue.`;
      $('clue').hidden = classic;
      if (!classic) renderClue(misses, done);

      // Newest guess first; only the row just submitted animates in.
      const newest = [...save.guesses].reverse();
      const body = $('rows');
      body.replaceChildren();
      if (classic) newest.forEach((name, i) => {
        const hero = byName.get(name.toLowerCase());
        const tr = el('tr', { className: animate && i === 0 ? 'reveal' : '' },
          el('th', { scope: 'row' }, portrait(hero.name, 64), el('span', { textContent: hero.name })));
        compare(hero, answer).forEach((c, j) => {
          const td = el('td', { className: c.status }, el('span', { textContent: c.value }));
          if (c.arrow) td.append(el('span', { className: 'arrow', textContent: c.arrow }));
          td.style.setProperty('--i', j);
          const verdict = { green: 'correct', yellow: 'partial match', red: 'wrong' }[c.status];
          const hint = c.arrow ? (c.arrow === '↑' ? ', answer is higher' : ', answer is lower') : '';
          td.setAttribute('aria-label', `${c.label}: ${c.value}, ${verdict}${hint}`);
          tr.append(td);
        });
        body.append(tr);
      });
      $('board').hidden = !classic || !save.guesses.length;
      $('list').hidden = classic || !save.guesses.length;
      $('list').replaceChildren(...newest.map((n, i) => {
        const hit = n === answer.name;
        return el('li', { className: (hit ? 'green' : 'red') + (animate && i === 0 ? ' reveal' : '') },
          portrait(n, 44), el('span', { textContent: n }), el('span', { className: 'mark', textContent: hit ? '✓' : '✕', ariaLabel: hit ? 'correct' : 'wrong' }));
      }));

      input.disabled = $('submit').disabled = done;
      $('win').hidden = !done;
      if (done) {
        $('win-text').textContent = `You got ${answer.name} in ${plural(save.guesses.length)}!`;
        $('win-img').src = `img/hero/${slug(answer.name)}.png`;
      }
      const streak = save.lastWin >= day - 1 ? save.streak || 0 : 0;
      $('streak').textContent = `${MODES[mode].label} streak: ${streak} · Best: ${save.best || 0}`;
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
        const li = el('li', { id: 'opt-' + i }, portrait(h.name, 36), el('span', { textContent: h.name }));
        li.setAttribute('role', 'option');
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
      store.set(storeKey(mode), save);
      input.value = '';
      matches = [];
      drawOptions();
      $('status').textContent = hero === answer ? 'Correct!' : `${hero.name} is not it.`;
      render(true);
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
      const rows = save.guesses.map((n) => mode === 'classic'
        ? compare(byName.get(n.toLowerCase()), answer).map((c) => c.status)
        : [n === answer.name ? 'green' : 'red']);
      const text = shareText(day, mode, rows) + '\n' + location.href;
      navigator.clipboard.writeText(text)
        .then(() => ($('status').textContent = 'Copied to clipboard!'))
        .catch(() => window.prompt('Copy your result:', text));
    });
    window.addEventListener('hashchange', load);

    load();
  }
}
