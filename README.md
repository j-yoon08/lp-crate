# LP Crate

LP Crate is a static browser app for searching, checking, and organizing a vinyl record collection.

**Live demo:** https://j-yoon08.github.io/lp-crate/

## What it does

- Search album metadata through MusicBrainz and Cover Art Archive
- Add records by search, drag-and-drop, or direct manual entry
- Track ownership status, genre, condition, pressing, rating, price, and quantity
- Show owned/wishlist counts and quantity-aware owned collection value
- Filter by ownership status and genre
- Sort by manual order, artist chronology, release year, rating, price, or quantity
- Switch between a detailed board view and a compact cover-wall view
- Load a built-in sample collection for first-run exploration
- Export/import the collection as JSON
- Export the visible board as SVG or a high-resolution square PNG cover wall
- Toggle light/dark mode

## Privacy and storage

LP Crate has no backend and no server database. Collection data is stored in the user's browser with `localStorage`.

Use **JSON export** before clearing browser data or moving the collection to another device.

## Development

This repository intentionally stays dependency-free. Open `index.html` directly in a browser, or serve the folder with any static file server.

Run the built-in checks:

```bash
npm run check
```

The check validates JavaScript syntax, required UI hooks, referenced static assets, and the web app manifest.

## Deployment

GitHub Actions deploys the repository root to GitHub Pages on every push to `main` after the static smoke check passes.

## License

MIT
