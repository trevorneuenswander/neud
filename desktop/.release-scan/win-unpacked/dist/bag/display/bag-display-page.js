"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBagDisplayPage = renderBagDisplayPage;
function renderBagDisplayPage(projectId) {
    const liveUrl = `/api/projects/${encodeURIComponent(projectId)}/bag/live`;
    const eventsUrl = `/api/projects/${encodeURIComponent(projectId)}/bag/live/events`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BAG Display</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
    }
    body {
      width: 1920px;
      height: 1080px;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #fff;
    }
    .safe {
      position: absolute;
      left: 56px;
      right: 56px;
      bottom: 24px;
    }
    .bar {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 20px;
      background: rgba(5, 8, 13, 0.85);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border-radius: 14px;
      padding: 16px 22px;
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.45);
      min-height: 56px;
    }
    .lot-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;
    }
    .lot-label {
      font-size: 14px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.75;
      font-weight: 700;
    }
    .lot-number {
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .title-block {
      min-width: 0;
    }
    .title {
      font-size: 30px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      margin-top: 6px;
      font-size: 16px;
      opacity: 0.8;
    }
    .bid-block {
      text-align: right;
      min-width: 180px;
    }
    .bid-label {
      font-size: 14px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.75;
      font-weight: 700;
    }
    .bid-value {
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .sold-badge {
      display: none;
      margin-top: 6px;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffd166;
    }
    .sold-badge.visible {
      display: block;
    }
    .hidden {
      opacity: 0.35;
    }
  </style>
</head>
<body>
  <div class="safe">
    <div class="bar" id="bar">
      <div class="lot-block">
        <div class="lot-label">Lot</div>
        <div class="lot-number" id="lotNumber">—</div>
      </div>
      <div class="title-block">
        <div class="title" id="title">Waiting for auction data</div>
        <div class="meta" id="meta"></div>
      </div>
      <div class="bid-block">
        <div class="bid-label">Current Bid</div>
        <div class="bid-value" id="bid">—</div>
        <div class="sold-badge" id="soldBadge">Sold</div>
      </div>
    </div>
  </div>
  <script>
    const LIVE_URL = ${JSON.stringify(liveUrl)};
    const EVENTS_URL = ${JSON.stringify(eventsUrl)};

    const lotNumberEl = document.getElementById("lotNumber");
    const titleEl = document.getElementById("title");
    const metaEl = document.getElementById("meta");
    const bidEl = document.getElementById("bid");
    const soldBadgeEl = document.getElementById("soldBadge");
    const barEl = document.getElementById("bar");

    function renderState(state) {
      const lot = state && state.currentLot ? state.currentLot : null;
      if (!lot) {
        lotNumberEl.textContent = "—";
        titleEl.textContent = "Waiting for auction data";
        metaEl.textContent = "";
        bidEl.textContent = "—";
        soldBadgeEl.classList.remove("visible");
        barEl.classList.add("hidden");
        return;
      }

      barEl.classList.remove("hidden");
      lotNumberEl.textContent = lot.lotNumber || "—";
      titleEl.textContent = lot.title || "—";
      const metaParts = [];
      if (lot.year) metaParts.push(lot.year);
      if (lot.reserveStatus) metaParts.push(lot.reserveStatus);
      metaEl.textContent = metaParts.join(" · ");
      bidEl.textContent = lot.currentBidLabel || (lot.currentBid != null ? String(lot.currentBid) : "—");
      soldBadgeEl.classList.toggle("visible", lot.sold === true);
    }

    async function loadCurrent() {
      const response = await fetch(LIVE_URL, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      renderState(payload.state);
    }

    function connectEvents() {
      const source = new EventSource(EVENTS_URL);
      source.addEventListener("bag.live-state.updated", (event) => {
        try {
          const payload = JSON.parse(event.data);
          renderState(payload.state);
        } catch (_) {}
      });
      source.onerror = () => {
        source.close();
        setTimeout(connectEvents, 2000);
      };
    }

    loadCurrent().catch(() => {});
    connectEvents();
  </script>
</body>
</html>`;
}
