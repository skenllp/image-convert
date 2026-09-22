# ImageConvert

Convert, compress and resize JPG, PNG and WebP images — entirely in the browser. No uploads, no accounts, no backend.

## What's here

```
image-convert/
├── index.html          Single-page app: home, converter, compressor, resizer, about, FAQ
├── privacy.html
├── terms.html
├── css/
│   └── style.css       Design system (tokens, layout, components)
├── js/
│   ├── converter.js    Core Canvas-based conversion engine (load, resize, encode, download)
│   ├── compressor.js   Compress-mode helpers (defaults, quality copy, size-reduction math)
│   ├── resizer.js      Resize-mode helpers (aspect-ratio syncing, dimension validation)
│   ├── ui.js            Presentation-only helpers (nav, tabs, FAQ accordion, toasts)
│   └── app.js           Application state and event wiring — the only file that touches both
└── assets/
    ├── og-image.png     1200×630 Open Graph / social preview image
    ├── favicon.png
    └── apple-touch-icon.png
```

**Architecture note:** the brief sketched "Compress Image" and "Resize Image" as possibly separate pages. They're implemented here as modes of one tool (tab-switched, same upload/preview UI) so there's a single, well-tested conversion pipeline (`converter.js`) instead of three near-duplicate ones. The dedicated SEO landing pages described below (`/png-to-jpg` etc.) can be added later as thin HTML pages that load the same `js/` files and pre-select a mode — the JS is already structured so that works without changes.

## How it works

Everything runs on `<canvas>`:

1. A `File` is read into an `<img>` via `URL.createObjectURL`.
2. The image is drawn onto an off-screen canvas at the target size (with a background fill for JPG, since JPG has no alpha channel).
3. `canvas.toBlob()` encodes the result to the chosen format and quality.
4. The resulting `Blob` is offered as a download via a temporary `<a download>` link, or bundled into a ZIP with [JSZip](https://stuk.github.io/jszip/) when converting multiple files.

No image data is ever sent over the network.

### Supported conversions

Reading and writing: **JPG, PNG, WebP** (WebP output is feature-detected — if a browser can't encode WebP, the option is disabled with an explanation rather than silently producing a broken file). GIF and BMP can be used as *input* and converted to one of the three output formats.

## Run it locally

No build step or package manager is required.

**Option 1 — just open it**
Double-click `index.html`. Everything works except that `fetch`-based features aren't used, so this is fine for this app.

**Option 2 — local server (recommended, avoids browser file:// quirks)**
```bash
cd image-convert
python3 -m http.server 8000
# then open http://localhost:8000
```
or, with Node installed:
```bash
npx serve .
```

## Deploy it

This is a fully static site — any static host works:

- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop the `image-convert` folder (or connect a Git repo) and deploy as-is. No build command needed.
- **GitHub Pages:** push the folder to a repo and enable Pages on the `main` branch root.
- **Any web server (Nginx, Apache, S3 + CloudFront, etc.):** upload the folder contents to the web root.

Before going live:
1. Replace every `https://YOURDOMAIN.com` occurrence in `index.html` (canonical URL, `og:url`, `og:image`, `twitter:image`) with your real production domain, so the Open Graph image resolves to a public URL.
2. Update the `mailto:hello@imageconvert.example` contact links in the footer and legal pages.
3. Serve over HTTPS — required for `og:image` to preview correctly on WhatsApp, LinkedIn, etc.

### Testing the WhatsApp / social preview

1. Deploy first — WhatsApp's crawler must be able to fetch a real public HTTPS URL; it can't see `file://` paths or localhost.
2. Run your live URL through [Facebook's Sharing Debugger](https://developers.facebook.com/tools/debug/) and click **Scrape Again**. WhatsApp shares the same crawler infrastructure, so this is the most reliable way to preview and force-refresh what it sees.
3. WhatsApp caches previews aggressively per URL. If you update `og-image.png` later, bump the version query string in `index.html` (`og-image.png?v=2`) so it's treated as a new asset instead of serving the stale cached one.
4. Keep the OG image under ~300KB — some WhatsApp clients silently drop previews above that. The current image is ~42KB, well under the limit.

## What was intentionally left out (v1 scope)

Per the brief, this version has **no backend, database, authentication, or server-side image processing**. HEIC/AVIF/TIFF conversion, an editor, filters, OCR, background removal, accounts and payments are not implemented — the codebase is organized (separate `converter` / `compressor` / `resizer` modules, a single settings object passed into the conversion pipeline) so those can be layered on without a rewrite.

## Browser support

Targets current Chrome, Edge, Firefox and Safari. WebP *encoding* support is checked at runtime via `canvas.toDataURL('image/webp')`; if unsupported, the WebP option is disabled in the UI instead of producing a broken file.
