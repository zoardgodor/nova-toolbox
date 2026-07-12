# Nova Toolbox

A fast, offline-capable, installable web app packed with 31 everyday tools for developers, designers and writers — password generators, converters, color tools, image utilities, text helpers and dev tools. No sign-up, no backend, no tracking. Everything runs locally in your browser.

Live demo: deploy to GitHub Pages (see below) or open `index.html` directly.

## Features

- **31 tools** across 6 categories — generators, converters, design, image, text and developer tools
- **Installable PWA** — add it to your home screen or desktop and it behaves like a native app
- **Offline-first** — a service worker caches the app shell so it keeps working without a connection
- **Bilingual** — full English and Hungarian translations, switchable at any time, remembered between visits
- **Favorites** — pin the tools you use most; saved locally on your device
- **Instant search** — filter all 31 tools as you type
- **Accessible** — semantic HTML, ARIA labels, visible focus states and solid color contrast
- **Zero dependencies** — no React, no Vue, no Bootstrap, no build step. Pure HTML, CSS and JavaScript
- **Privacy-first** — nothing you type or upload is ever sent to a server (the REST API Tester is the one tool that talks to the network, and only to the endpoint you tell it to)

## Full tool list

### Generators
- Password Generator — custom length, character sets, one-click copy
- Random Name Generator — random first/last name combinations
- UUID Generator — RFC 4122 v4 UUIDs, batch generation
- Hash Generator — SHA-1 / SHA-256 / SHA-512 of any text

### Converters
- JSON Formatter — pretty-print and validate JSON with adjustable indent
- JSON Minifier — strip whitespace, see the size savings
- Base64 Encoder
- Base64 Decoder
- Unix Timestamp Converter — timestamp ↔ human-readable date, local and UTC
- Text to Binary Converter — both directions
- Text to Morse Converter — both directions, with audio playback

### Design tools
- Color Picker — pick a color, get HEX/RGB/HSL instantly, recent colors saved
- HEX ↔ RGB ↔ HSL Converter
- CSS Gradient Generator — linear or radial, live preview, copy-ready CSS
- CSS Box Shadow Generator — visual editor, copy-ready CSS
- Font Pairing Tool — curated heading/body pairings with live preview

### Image tools
- Image Resize Tool — resize in-browser, download the result
- Image Compressor — adjustable JPEG quality with before/after size
- Image to Base64 Converter — produces a ready-to-use data URI
- Favicon Generator — generates 16/32/48/180/192/512 px PNGs from any image

### Text tools
- Markdown Editor + Preview — live rendered preview as you type
- Word Counter — words, sentences, paragraphs, estimated reading time
- Character Counter — with/without spaces, optional character limit
- Lorem Ipsum Generator — by paragraphs, sentences or words
- Text Case Converter — UPPERCASE, lowercase, Capitalized Case
- Find and Replace — case-sensitive and whole-word options

### Developer tools
- HTML Escape / Unescape
- CSS Minifier — with size savings
- JavaScript Formatter — consistent indentation
- Regex Tester — live match highlighting
- REST API Tester — send requests, inspect status/time/response, right in the browser

## Technologies used

- HTML5
- CSS3 (custom properties, grid, flexbox — no framework)
- Vanilla JavaScript (ES2020+)
- Service Worker (Cache API) for offline support
- Web App Manifest for installability
- LocalStorage for language, favorites and recent colors
- Web Crypto API for hashing and secure random values
- Canvas API for image resizing, compression and favicon generation
- Web Audio API for Morse code playback
- Fetch API for the REST API Tester

## File structure

```
nova-toolbox/
├── index.html          # App shell markup (no inline text — everything via translations.js)
├── styles.css           # All styling
├── script.js             # App logic + all 31 tool implementations
├── translations.js  # English and Hungarian strings
├── sw.js                    # Service worker (offline cache)
├── manifest.json      # PWA manifest
├── icon-192.png        # App icon, 192×192 (add your own)
├── icon-512.png        # App icon, 512×512 (add your own)
└── README.md
```

## Installation

No build step, no package manager required.

```bash
git clone https://github.com/your-username/nova-toolbox.git
cd nova-toolbox
```

Add your own `icon-192.png` and `icon-512.png` in the project root — the manifest and service worker already reference them.

## Running locally

Because the app registers a service worker, it needs to be served over `http://` or `https://` (opening `index.html` directly with `file://` will work for most tools, but the service worker and installability require a local server).

Any static server works, for example:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Then open `http://localhost:8080`.

## GitHub Pages deployment

1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Source**, select the branch (e.g. `main`) and root folder (`/`).
4. Save — GitHub will publish the site at `https://your-username.github.io/nova-toolbox/`.

No configuration changes are needed: all asset paths in `index.html`, `manifest.json` and `sw.js` are relative, so the app works correctly whether it's served from a domain root or a subpath like GitHub Pages.

## PWA installation

- **Desktop (Chrome/Edge):** open the site, click the install icon in the address bar, or use the "Install app" option in the in-app menu once it appears.
- **Android (Chrome):** open the site, tap the menu (⋮), then "Add to Home screen" — or use the in-app install prompt.
- **iOS (Safari):** open the site, tap the Share icon, then "Add to Home Screen" (iOS does not support the automatic install prompt, so this manual step is required).

Once installed, Nova Toolbox opens in its own window without browser chrome, using the colors and icons defined in `manifest.json`.

## Offline functionality

On first visit, the service worker (`sw.js`) caches the app shell (HTML, CSS, JS, translations, manifest, icons). On every subsequent visit:

- Cached files are served instantly (cache-first), so the app loads even with no connection.
- In the background, the service worker tries to fetch a fresh copy and updates the cache for next time.
- Every tool works fully offline **except** the REST API Tester, which needs a network connection to reach whatever endpoint you point it at.

To force an update after changing any cached file, bump `CACHE_VERSION` at the top of `sw.js` — this ensures old caches are cleared on the next load.

## Language system

- Default language is **English**.
- Every user-facing string lives in `translations.js`, under `TRANSLATIONS.en` and `TRANSLATIONS.hu` — nothing is hard-coded in `index.html`.
- The UI looks strings up by key at render time via a small `t(key, params)` helper in `script.js`, so switching languages re-renders all visible text instantly, with no page reload.
- The selected language is saved to `localStorage` under the key `nova_language` (`"en"` or `"hu"`) and restored automatically on the next visit.
- Switch languages any time via the "EN"/"HU" button in the header or the language buttons in the side menu.

## LocalStorage usage

| Key                     | Purpose                                        |
|--------------------------|-------------------------------------------------|
| `nova_language`     | Selected UI language (`"en"` or `"hu"`) |
| `nova_favorites`    | Array of favorited tool ids                |
| `nova_recent_colors` | Recently picked colors (Color Picker tool) |

All data stays on the user's device — nothing is sent anywhere.

## Future improvement ideas

- Add more languages beyond English/Hungarian
- IndexedDB-backed history for tools like the API Tester and Regex Tester
- Keyboard shortcut palette (Cmd/Ctrl+K) for jumping straight to a tool
- Export/import of favorites and settings as a JSON file
- A proper AST-based JavaScript formatter/minifier for trickier code
- Drag-and-drop reordering of favorites
- Light theme option alongside the current dark theme

## License

MIT License — free to use, modify and distribute. Attribution appreciated but not required.
