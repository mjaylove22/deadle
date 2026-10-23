// Rebuilds heroes.json and downloads art/icons/voice lines from deadlock.wiki.
// Run from the repo root: node scripts/fetch-wiki.js
// Keeps hand-written fields (emoji, added) from the existing heroes.json. Anything the wiki doesn't have becomes "TODO".
// Re-runnable: files already on disk are not downloaded again.
const fs = require('fs');
const { slug } = require('../app.js'); // same file names the game looks up
const WIKI = 'https://deadlock.wiki';
const HEADERS = { 'User-Agent': 'Urndle fan game data refresh (github.com/mjaylove22/urndle)' };
const MAX_QUOTES = 6;

const raw = async (title) => (await fetch(`${WIKI}/index.php?action=raw&title=${encodeURIComponent(title)}`, { headers: HEADERS })).text();

async function download(url, path) {
  if (fs.existsSync(path)) return true;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return false;
  fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return true;
}

// File page title -> { url, thumb } (thumb only when width is given). Missing files are absent from the result.
async function fileUrls(titles, width) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const q = new URLSearchParams({ action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json', formatversion: '2', titles: titles.slice(i, i + 50).join('|') });
    if (width) q.set('iiurlwidth', width);
    const data = await (await fetch(`${WIKI}/api.php?${q}`, { headers: HEADERS })).json();
    const norm = Object.fromEntries((data.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of data.query.pages) if (p.imageinfo) out[norm[p.title] || p.title] = { url: p.imageinfo[0].url, thumb: p.imageinfo[0].thumburl };
  }
  return out;
}

// Lines from a "== Select ==" section: {{Audio link|file.mp3|transcript}}, optionally followed by a "|Translation" cell.
function selectLines(page) {
  const lines = page.split('\n');
  const start = lines.findIndex((l) => /^==\s*Select\s*==\s*$/.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !/^==[^=]/.test(lines[i]); i++) {
    const m = lines[i].match(/\{\{Audio link\|([^|}]+)\|([^}]+)\}\}/);
    if (!m) continue;
    const next = lines[i + 1] || '';
    const translation = /^\|[^-{]/.test(next) ? next.slice(1) : '';
    out.push({ file: m[1].trim(), text: (translation || m[2]).replace(/'''?|\[\[|\]\]/g, '').trim() });
  }
  return out;
}

// Quote is usable if it doesn't name the hero, has real words besides [sound effects], and isn't an alt take of an earlier line.
function usable(q, i, all, heroName) {
  const words = heroName.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2 && w !== 'the');
  const spoken = q.text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
  return spoken.split(/\s+/).length >= 3
    && !words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(q.text))
    && !all.slice(0, i).some((p) => p.text.slice(0, 40) === q.text.slice(0, 40));
}

(async () => {
  const heroData = JSON.parse(await raw('Data:HeroData.json'));
  const releases = JSON.parse(await raw('Data:HeroReleases.json')).heroes.filter((h) => h.date);
  const byName = Object.fromEntries(Object.values(heroData).filter((v) => v && v.Name).map((v) => [v.Name, v]));
  const old = fs.existsSync('heroes.json') ? Object.fromEntries(JSON.parse(fs.readFileSync('heroes.json', 'utf8')).map((h) => [h.name, h])) : {};
  const TRAIT = { RapidFire: 'Rapid Fire', BurstFire: 'Burst Fire', BeamWeapon: 'Beam', HeavyHitter: 'Heavy Hitter', Spreadshot: 'Spreadshot', Projectile: 'Projectile', Bouncy: 'Bouncy' };
  const RANGE = { CloseRange: 'Close', MediumRange: 'Medium', LongRange: 'Long' };
  const todo = [];

  const heroes = [];
  for (const r of releases) {
    const h = byName[r.hero];
    if (!h) { todo.push(`${r.hero}: not in Data:HeroData.json, skipped`); continue; }
    const page = await raw(r.hero);
    const pronouns = ((page.match(/^\|\s*pronouns\s*=\s*(.*)$/im) || [])[1] || '').match(/He\/Him|She\/Her|They\/Them/);
    const tags = (h.Weapon?.WeaponTypes || []).map((t) => t.replace('Attribute_EWeaponAttribute_', ''));
    tags.filter((t) => !TRAIT[t] && !RANGE[t]).forEach((t) => todo.push(`${r.hero}: unknown weapon tag ${t} (add it to TRAIT/RANGE)`));
    const quotes = selectLines(await raw(`${r.hero}/Voice lines`))
      .filter((q, i, all) => usable(q, i, all, r.hero))
      .slice(0, MAX_QUOTES);
    const hero = {
      name: r.hero,
      pronouns: pronouns ? pronouns[0] : 'TODO',
      type: h.Type || 'TODO',
      weapon: tags.filter((t) => TRAIT[t]).map((t) => TRAIT[t]).sort(),
      range: tags.filter((t) => RANGE[t]).map((t) => RANGE[t])[0] || 'None',
      year: Number(r.date.slice(0, 4)),
      health: h.MaxHealth ?? 'TODO',
      clip: h.Weapon?.ClipSize ?? 'TODO',
      ...(old[r.hero]?.added && { added: old[r.hero].added }),
      emoji: old[r.hero]?.emoji || 'TODO',
      abilities: [1, 2, 3, 4].map((k) => h.BoundAbilities?.[k]?.Name).filter(Boolean),
      quotes,
    };
    if (!pronouns) todo.push(`${r.hero}: pronouns`);
    if (hero.emoji === 'TODO') todo.push(`${r.hero}: emoji (hand-written)`);
    if (quotes.length < 3) todo.push(`${r.hero}: only ${quotes.length} usable Select voice lines`);
    heroes.push(hero);
    process.stdout.write('.');
  }
  console.log();

  // Splash art: 640px thumbnail of "<Hero> Render.png". The CDN only has webp for older files, so fall back to png.
  const renders = await fileUrls(heroes.map((h) => `File:${h.name} Render.png`), 640);
  for (const h of heroes) {
    const f = renders[`File:${h.name} Render.png`], base = `img/splash/${slug(h.name)}`;
    if (f && (await download(f.thumb + '.webp', base + '.webp'))) h.splash = base + '.webp';
    else if (f && (await download(f.thumb, base + '.png'))) h.splash = base + '.png';
    else { h.splash = 'TODO'; todo.push(`${h.name}: splash art`); }
  }
  // Hero portrait icons (autocomplete, guess rows): "<Hero>.png"
  const portraits = await fileUrls(heroes.map((h) => `File:${h.name}.png`));
  for (const h of heroes) {
    const f = portraits[`File:${h.name}.png`];
    if (!f || !(await download(f.url, `img/hero/${slug(h.name)}.png`))) todo.push(`${h.name}: portrait icon`);
  }
  // Ability icons: "<Ability>.png"
  const icons = await fileUrls(heroes.flatMap((h) => h.abilities.map((a) => `File:${a}.png`)));
  for (const h of heroes) for (const a of h.abilities) {
    const f = icons[`File:${a}.png`];
    if (!f || !(await download(f.url, `img/ability/${slug(a)}.png`))) todo.push(`${h.name}: ability icon "${a}"`);
  }
  // Voice lines
  const audio = await fileUrls(heroes.flatMap((h) => h.quotes.map((q) => `File:${q.file}`)));
  for (const h of heroes) {
    h.quotes = (await Promise.all(h.quotes.map(async (q, i) => {
      const f = audio[`File:${q.file}`], path = `audio/${slug(h.name)}-${i + 1}.mp3`;
      if (f && (await download(f.url, path))) return { text: q.text, audio: path };
      todo.push(`${h.name}: audio "${q.file}"`);
      return { text: q.text };
    })));
  }

  heroes.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync('heroes.json', '[\n' + heroes.map((h) => '  ' + JSON.stringify(h)).join(',\n') + '\n]\n');
  console.log(`${heroes.length} heroes written.`);
  console.log(todo.length ? 'TODO:\n  ' + todo.join('\n  ') : 'No TODOs.');
})();
