# Deadle

A daily hero-guessing game for Valve's Deadlock, in the style of LoLdle. Fan project, not affiliated with Valve.

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

## Data

`heroes.json` comes from [deadlock.wiki](https://deadlock.wiki): `Data:HeroData.json` (type, weapon, health, clip),
`Data:HeroReleases.json` (release year) and each hero page's infobox (pronouns). Health and clip size change with
balance patches.

Adding a hero: append it with `"added": "YYYY-MM-DD"` (today or later, never earlier) so past days keep their answers.
Never change `LAUNCH` in `app.js` after launch.
