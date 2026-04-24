# LP Crate

LP Crate is a static browser app for searching, checking, and organizing a vinyl collection.

## Features

- Search albums through MusicBrainz
- Add records by dragging search results into the collection board
- Filter by ownership status and genre
- Switch between board, cover wall, and 3D shelf views
- Sort and reorder records
- Refresh album metadata from MusicBrainz
- Export/import the collection as JSON
- Export the visible board as SVG or a square PNG cover wall

## Data Storage

The app does not use a server database. Collection data is stored in the user's browser with `localStorage`.

Use JSON export before clearing browser data or moving the collection to another device.

## Development

Open `index.html` directly in a browser, or serve this folder with any static file server.
