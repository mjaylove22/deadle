# Deadle

A daily hero-guessing game for Valve's Deadlock, in the style of LoLdle. Fan project, not affiliated with Valve.

Five modes, each with its own hero of the day (switch with the tabs, or link straight to `#quote`, `#ability`, `#emoji`, `#splash`):

| Mode | Clue | Each wrong guess… |
|---|---|---|
| Classic | Attribute comparison table | adds a row of green/yellow/red hints |
| Quote | A voice line transcript | after 3, unlocks the audio |
| Ability | An ability icon, rotated | after 3, turns it upright |
| Emoji | Emoji describing the hero | reveals one more emoji |
| Splash | Zoomed-in hero art | zooms out |

## Run locally

`fetch` doesn't work over `file://`, so serve the folder:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Test

```
node test.js
```

Checks the daily pick for every mode, the attribute comparison, share text, and that every image/audio file exists.

## Data

Everything except emoji comes from [deadlock.wiki](https://deadlock.wiki). Refresh it with:

```
node scripts/fetch-wiki.js
```

It rebuilds `heroes.json` (type, weapon, health, clip from `Data:HeroData.json`; release year from
`Data:HeroReleases.json`; pronouns from hero infoboxes; ability names; English "Select" voice lines) and downloads
splash art (`img/splash`), ability icons (`img/ability`) and voice lines (`audio`). It keeps the hand-written `emoji`
and `added` fields, skips files already downloaded, and prints a TODO list of anything the wiki doesn't have yet.

Adding a hero after launch: run the script, write its `emoji`, and give it `"added": "YYYY-MM-DD"` (today or later,
never earlier) so past days keep their answers. Only add it once it has art, icons and voice lines. Never change
`LAUNCH` or a mode's `salt` in `app.js` after launch.
