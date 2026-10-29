# DanceWeather

NYC raves as a weather forecast: tonight in 3D, the next 10 nights with every show, a month outlook, artist "fronts" and a radar of where people are playing.

It's a static site on GitHub Pages. A scheduled GitHub Action pulls fresh listings every six hours and republishes the site. No AI runs anywhere: every listing, score and front is worked out by plain rules in `scripts/update.mjs` and `app/app.js`.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html`, `app/app.js`, `app/field.js`, `icon.png` | The app |
| `data/events.json` | The listings the app reads. Written by the updater; don't edit it by hand |
| `data/manual.json` | Parties you add by hand (RA, Dice, Shotgun and Posh exclusives) |
| `data/venues.json` | Each venue's spot on the map, its neighborhood and its room size (0–2) |
| `data/config.json` | City, timezone, API settings and venue pages to read |
| `scripts/update.mjs` | The updater (Node 20, no packages) |
| `.github/workflows/update.yml` | Runs the updater every six hours and publishes the site |

## Set it up

1. **Create the repo.** On GitHub, make a new public repository called `danceweather` and upload everything in this folder, keeping the folders as they are. If the `.github` folder doesn't upload (some browsers skip folders that start with a dot), use **Add file → Create new file**, name it `.github/workflows/update.yml` and paste the file's contents.
2. **Turn on Pages.** Settings → Pages → Source: **GitHub Actions**.
3. **Let the workflow save listings.** Settings → Actions → General → Workflow permissions: **Read and write permissions** → Save.
4. **Add your keys** (all optional; any source without a key is skipped). Settings → Secrets and variables → Actions → New repository secret:
   - `EDMTRAIN_KEY`
   - `TICKETMASTER_KEY`
   - `REDDIT_CLIENT_ID`
   - `REDDIT_CLIENT_SECRET`
5. **Put your username in `data/config.json`** where it says `YOUR-USERNAME`. Reddit asks every app to identify itself this way.
6. **Run it once.** Actions tab → **Update listings and publish** → **Run workflow**. When it finishes, the site is at `https://YOUR-USERNAME.github.io/danceweather/`.
7. **Add it to your iPhone.** Open the site in Safari → Share → **Add to Home Screen**.

After that it runs by itself every six hours, and again whenever you push a change.

## Getting the keys

- **Edmtrain** (mainstream EDM listings): apply for a key from the developer section of [edmtrain.com/api-documentation](https://edmtrain.com/api-documentation). Read their terms; they may ask you to credit Edmtrain.
- **Ticketmaster** (bigger rooms like Terminal 5 and Brooklyn Paramount): register at [developer.ticketmaster.com](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/), create an app and copy its Consumer Key. The free quota is 5,000 calls a day; each run uses about five.
- **Reddit** (r/avesNYC mentions): go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps), create an app of type **script**, then copy the client ID (the string under the app's name) and the secret. Free for non-commercial use.

## Adding parties by hand

RA, Dice, Shotgun and Posh don't offer open APIs, so their exclusives go in `data/manual.json`. Add an entry, commit, and the site updates within a few minutes:

```json
{"date":"2026-12-05","name":"Example Party","venue":"Nowadays","artists":["Artist One","Artist Two"],"start":"22:00","end":"06:00","status":"From $25","url":"https://ra.co/events/...","source":"RA"}
```

- `venue` should match a name (or alias) in `data/venues.json` so the party lands on the map. Use `where` instead for a place with no address yet.
- An `end` earlier than `start` means after midnight.
- Optional: `series` (the same value on each night of a multi-night run), `festival`, `raPick`, `final` (a venue's last night), `promoter`, `note`, and `lvl` to force the draw from 1 to 5.
- Past dates drop off by themselves.

To put a new venue on the map, add it to `data/venues.json`. `x` runs 0–390 from west (longitude −74.02) to east, and `y` runs 0–440 from north (latitude 40.76) to south: `x = (longitude + 74.02) × 3000`, `y = (40.76 − latitude) × 3706.6`.

## Venue pages

Many venue sites publish their calendars as schema.org Event data. Add those page URLs to `"feeds"` in `data/config.json` and the updater will read them. To check a page, view its source and search for `application/ld+json` with `"Event"` inside.

## How the numbers work

**Draw (1–5)** starts at 1 and adds:
- +2 sold out
- +2 festival
- +1 RA Pick
- +1 a lineup of five or more
- +1 tickets over $60
- +1 runs ten hours or longer
- +0 to +2 for room size, from `venues.json`
- +1 if r/avesNYC mentions it, +1 more at five mentions
- +1 if two or more sources list it

**Conditions** for a night: *Severe storms* is a severe-draw party plus ten or more listings, or a festival. *Thunderstorms* means at least one very heavy party. *Showers* and *Scattered showers* are lighter nights.

**Fronts** come straight from the lineups: artists billed on more than one night, multi-night runs, venues with four or more nights, parties of 13 hours or more, back-to-back sets and closing nights.

**What people are saying** shows the most upvoted r/avesNYC post or comment from the last three weeks that names the party or someone on its lineup.

## Things to know

- GitHub [pauses scheduled workflows in public repos after 60 days without activity](https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow). If the listings stop updating, go to the Actions tab and click **Enable workflow**.
- If one source fails, the run keeps the others and logs a warning. The app's **How it works** sheet shows how many listings each source returned last time.
- Edmtrain's documentation doesn't show its response format, so `fromEdmtrain()` uses the field names its API has used (`date`, `startTime`, `venue.latitude`, `artistList`, `b2bInd`). If Edmtrain returns errors or empty listings, check the run log and adjust that function.
- Ticketmaster settings: `dmaId` 345 is the New York market and segment `KZFzniwnSyZfZ7v7nJ` is Music.
- Instagram only lets apps read accounts they manage, so @NYCRAVEGIRLS can't be pulled in automatically.

## Run it on your computer

```sh
node scripts/update.mjs          # rebuild data/events.json (add keys as environment variables to include those sources)
python3 -m http.server 8000      # then open http://localhost:8000
```

Opening `index.html` straight from a file won't load the listings; it needs a web server like the one above.
