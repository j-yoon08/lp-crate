# LP Crate

A local-first web app for searching, organizing, and exporting a vinyl record collection.

[Open the live demo](https://j-yoon08.github.io/lp-crate/)

LP Crate keeps collection management lightweight: there is no account, backend, or database to operate. Album data is enriched through public music metadata services, while the collection itself stays in the browser.

## Highlights

- Search releases through MusicBrainz and Cover Art Archive
- Add records from search results, drag and drop, or manual entry
- Track ownership, genre, condition, pressing, rating, price, and quantity
- Calculate an owned-only, quantity-aware collection value
- Filter and sort by status, genre, artist chronology, year, rating, price, or quantity
- Switch between a detailed board and compact cover-wall view
- Export and restore the collection as JSON
- Export the visible collection as SVG or a high-resolution square PNG
- Preserve preferences and collection data between sessions
- Use light or dark mode

## Technical approach

LP Crate is intentionally dependency-free and deploys as a static site.

| Area | Implementation |
| --- | --- |
| UI | Semantic HTML, CSS, and vanilla JavaScript |
| Persistence | Browser `localStorage` with invalid-data recovery |
| Metadata | MusicBrainz and Cover Art Archive HTTP APIs |
| Export | Browser-native JSON, SVG, and Canvas APIs |
| Deployment | GitHub Pages through GitHub Actions |
| Validation | JavaScript syntax and static asset/UI smoke checks |

The design keeps hosting simple and makes the core collection usable without a server. The trade-off is that data does not automatically sync between browsers or devices.

## Privacy and data ownership

Collection records are stored in the current browser. LP Crate does not send the collection to an application backend because no backend exists.

Search terms are sent to MusicBrainz, and album artwork is requested from Cover Art Archive when those features are used. Their availability and privacy policies apply to those requests.

Export a JSON backup before clearing browser data, switching browsers, or moving to another device.

## Run locally

Requirements:

- A modern browser
- Node.js only if you want to run the checks

Clone the repository:

```bash
git clone https://github.com/j-yoon08/lp-crate.git
cd lp-crate
```

Open `index.html` directly, or serve the directory with any static file server.

Run the repository checks:

```bash
npm run check
```

This validates JavaScript syntax, required UI hooks, referenced assets, and the web app manifest.

## Project structure

```text
index.html               Application shell and dialogs
styles.css               Responsive visual system and export styles
app.js                   State, persistence, search, sorting, and export logic
assets/                  Local sample artwork and fallback assets
scripts/static-smoke.mjs Static repository checks
.github/workflows/       GitHub Pages deployment
```

## Deployment

Every push to `main` runs the static check and deploys the repository root to GitHub Pages.

## Current limitations

- Collection data is local to one browser profile unless exported and imported manually.
- Search and remote cover loading depend on third-party service availability.
- The project does not provide authentication, cloud sync, or multi-user sharing.

## License

[MIT](LICENSE)
