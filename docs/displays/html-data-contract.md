# Uploaded HTML Display Data Contract

NEUD injects a runtime bootstrap when serving uploaded HTML displays. Your stored HTML file is never modified.

## Canonical snapshot

Every display receives the same Broad Arrow canonical JSON object used by JSON Preview, Webpage Scraper, and Local Controller:

- `current.lot`, `current.title`, `current.price`, `current.status`, …
- `next`, `lots`, `lastSold`, `dataSource`, …

The active transport is local HTTP polling against the display data endpoint (`/api/display/{projectId}/{slug}/data`).

## Primary API — `window.NEUDDisplay`

```html
<script>
  function render(snapshot) {
    document.querySelector("#lot-title").textContent =
      snapshot?.current?.title ?? "—";
  }

  if (window.NEUDDisplay) {
    render(window.NEUDDisplay.getSnapshot());
    window.NEUDDisplay.subscribe(render);
  }
</script>
```

- `NEUDDisplay.getSnapshot()` — latest canonical object (or `null` before the first fetch)
- `NEUDDisplay.subscribe(callback)` — called immediately if data exists, then on every update
- `NEUDDisplay.getDisplayInfo()` — `{ projectId, displayId, slug, name, source, enabled }`
- `NEUDDisplay.signalReady()` — optional explicit readiness signal

## Runtime message contract

The injected runtime and HTML displays use one namespaced contract:

```js
// Display → runtime
{ source: "neud-display", type: "NEUD_DISPLAY_READY" }

// Runtime → display
{
  source: "neud-runtime",
  type: "NEUD_DATA_UPDATE",
  version: 1,
  payload: canonicalProjectJson,
  revision: 42,
}
```

Legacy displays may also receive:

- `window.NEUD_DATA`
- `window.displayData`
- `CustomEvent("neud:data")`

## Compatibility aliases

The runtime also exposes:

- `window.NEUD_DATA`
- `window.displayData`

And dispatches:

```js
window.addEventListener("neud:data", (event) => {
  render(event.detail);
});
```

## Preview, fullscreen, and local URL

- **Inline preview** on the Displays page loads the viewer with `?preview=1` and receives live updates.
- **View Fullscreen** uses the same viewer URL with preview mode.
- **Copied local URL** follows the display Enabled/Disabled policy; management previews always receive data.

## Offline

The local data endpoint serves cached canonical snapshots while offline. Displays continue to poll locally.

## Legacy tickers

Displays that include `NEUDDisplayConnection.createDisplayDataPoller()` continue to work when their HTML references the display data endpoint. New uploads should prefer `NEUDDisplay.subscribe()`.
