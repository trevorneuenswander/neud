# Generic Webpage Scraper

The Generic Webpage Scraper is the default adapter for `webpage-scraper` projects. It opens a configured page, optionally logs in first, extracts named CSS fields, and writes a versioned generic snapshot. It never runs BAG auction logic.

## Adapter selection

| Project type       | Adapter            |
| ------------------ | ------------------ |
| `bag-graphics`     | `bag-auction`      |
| `webpage-scraper`  | `generic-webpage`  |

New generic engines are created with `adapter: "generic-webpage"` explicitly. The worker registry rejects missing or unknown adapters and does **not** fall back to BAG.

Incompatible pairings are blocked before Start or Run Once with structured error codes such as `incompatible-adapter`, `missing-page-url`, and `missing-login-selectors`.

## Configuration

Generic scraper settings live in two places:

1. **Sources** (SQLite / Supabase `webpage_scraper_sources`)
   - `page` — required Page URL
   - `login` — optional Login URL
2. **Engine config** (`data_sources.config_json`)
   - `login` — username/password/submit/success selectors
   - `fields` — extraction field definitions

Example engine config:

```json
{
  "adapter": "generic-webpage",
  "execution_mode": "local-desktop",
  "login": {
    "usernameSelector": "#email",
    "passwordSelector": "#password",
    "submitSelector": "button[type=submit]",
    "successUrlContains": "/dashboard"
  },
  "fields": [
    {
      "key": "headline",
      "label": "Headline",
      "selector": "h1",
      "extraction": "text"
    },
    {
      "key": "hero",
      "label": "Hero image",
      "selector": ".hero img",
      "extraction": "attribute",
      "attribute": "src"
    }
  ]
}
```

Supported extraction types:

- `text` — trimmed text content
- `html` — element inner HTML
- `attribute` — named attribute value (`attribute` required)

## Page URL

Required before Start or Run Once. If missing, the engine is blocked with:

> Page URL is not configured. Add the webpage you want to scrape before starting the engine.

## Optional Login URL

When a Login URL is configured:

1. Navigate to Login URL
2. Fill username and password using configured selectors
3. Submit the form
4. Confirm success via optional selector or URL rule
5. Navigate to Page URL
6. Extract configured fields

If Login URL is present but selectors are incomplete, Start and Run Once are blocked with an actionable error.

## Credential storage

Username and password are stored in the desktop credential manager only. They are passed to the worker as `SCRAPER_EMAIL` and `SCRAPER_PASSWORD` environment variables at runtime. Credentials are never written into exported project JSON or source URLs.

## Generic snapshot format

```json
{
  "schemaVersion": 1,
  "adapter": "generic-webpage",
  "sourceUrl": "https://example.com/products",
  "capturedAt": "2026-07-17T12:00:00.000Z",
  "page": {
    "title": "Products",
    "finalUrl": "https://example.com/products"
  },
  "values": {
    "headline": {
      "value": "Weekly specials",
      "found": true,
      "selector": "h1",
      "extraction": "text"
    },
    "missing-field": {
      "value": null,
      "found": false,
      "selector": ".does-not-exist",
      "extraction": "text"
    }
  }
}
```

Generic snapshots flow through the normal local snapshot pipeline. They are **not** processed by the BAG live-state normalizer.

Missing selectors report `found: false` without failing the entire scrape.

## Poll rate behavior

Generic scrapers use the existing worker scheduler and `poll_interval_ms` setting. One-second polling (`1000` ms) is supported.

Each poll cycle:

- Reuses the same browser instance when the engine stays running
- Navigates to the Page URL again to refresh content
- Waits for the existing scheduler sleep so cycles do not overlap

Run Once executes a single scrape and stops the browser when desired state is `stopped`.

## Run Once configuration workflow

1. Configure Page URL and extraction fields
2. Optionally configure Login URL, login selectors, and desktop credentials
3. Click **Run Once**
4. Review the JSON preview and extracted-field table
5. Adjust selectors and repeat as needed

Validation runs before Puppeteer launches. Failures are written to engine logs and `last_error`.

## Desktop execution

Recommended for interactive configuration. Puppeteer runs locally, snapshots write to local SQLite, and optional credentials stay on the PC.

## Remote Worker execution

Generic projects may use Remote Worker execution when `execution_mode` is `remote-worker`. The remote worker must include `workers/data-engine/src/adapters/generic-webpage.js` in its deployed code version.

BAG projects remain desktop-enforced for Manual Mode and OBS features.

## Converting older contaminated projects

Some older generic projects may still have `adapter: "bag-auction"`. The engine UI shows:

> This generic Webpage Scraper is configured with the BAG Auction adapter.

Use **Convert to Generic Webpage Scraper** to:

1. Preserve the previous adapter config in logs/metadata
2. Set `adapter` to `generic-webpage`
3. Optionally remove untouched BAG default source URLs
4. Preserve customized URLs, polling settings, and credentials

Conversion never runs automatically and does not affect `bag-graphics` projects.

## Limitations

- No visual browser selector picking
- No arbitrary JavaScript execution
- No CAPTCHA or anti-bot bypass
- Login success detection is limited to optional selector or URL substring checks
- Remote compatibility depends on worker deployment version

## Recommended next milestone

Auction export/import with explicit manual vs automatic history restore for BAG projects.
