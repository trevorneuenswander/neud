"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_TICKER_APPLY_AND_NORMALIZE_PATTERN = exports.TICKER_V3_LOT_AND_NORMALIZE_JS = exports.TICKER_V3_BOX_MODEL_CSS = void 0;
exports.TICKER_V3_BOX_MODEL_CSS = `
  /* NEUD v3: preserve legacy content-box pill sizing in hosted previews */
  html,
  body {
    box-sizing: content-box;
  }

  #variant-ticker,
  #variant-ticker *,
  #variant-ticker *::before,
  #variant-ticker *::after {
    box-sizing: content-box;
  }
`;
exports.TICKER_V3_LOT_AND_NORMALIZE_JS = `function resolveLotNumber(lotObj) {
  if (!lotObj || typeof lotObj !== "object") {
    return "";
  }

  const raw = (
    lotObj.lot ??
    lotObj.lotNumber ??
    lotObj.lot_number ??
    lotObj.number ??
    ""
  )
    .toString()
    .trim()
    .replace(/^lot\\s+/i, "")
    .trim();

  if (!raw || raw === "—" || raw === "-") {
    return "";
  }

  return raw;
}

function resolveLotTitle(lotObj) {
  return (
    lotObj?.title ??
    lotObj?.desc ??
    lotObj?.description ??
    ""
  )
    .toString()
    .trim();
}

function normalizeNextLotEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const lotNumber = resolveLotNumber(entry);
  const title = resolveLotTitle(entry);
  if (!lotNumber && !title) {
    return null;
  }

  return {
    lot: lotNumber || "—",
    title,
  };
}

function applyLotToSlot(slotIndex, lotObj){
  const lotNumber = resolveLotNumber(lotObj);
  const lotText = lotNumber ? \`Lot \${lotNumber}\` : "Lot —";
  const titleText = resolveLotTitle(lotObj);

  if (slotIndex === 1){
    transitionText(slot1LotEl, lotText);
    transitionTitle(slot1TitleEl, titleText);
  } else if (slotIndex === 2){
    transitionText(slot2LotEl, lotText);
    transitionTitle(slot2TitleEl, titleText);
  } else if (slotIndex === 3){
    transitionText(slot3LotEl, lotText);
    transitionTitle(slot3TitleEl, titleText);
  }
}

/* ---------- Normalize server feed ---------- */
function normalize(d){
  if(!d) return { next: [] };

  let next = Array.isArray(d.next) ? d.next : [];

  if ((!next || !next.length) && d.ticker && Array.isArray(d.ticker.next) && d.ticker.next.length) {
    next = d.ticker.next;
  }

  if ((!next || !next.length) && Array.isArray(d.lots) && d.lots.length){
    const idx = d.lots.findIndex(x => x.status && /active/i.test(x.status));
    if (idx >= 0) next = d.lots.slice(idx+1, idx+4);
    else next = d.lots.slice(1,4);
  }

  next = (next || [])
    .map(normalizeNextLotEntry)
    .filter(Boolean)
    .slice(0,3);
  return { next };
}`;
exports.LEGACY_TICKER_APPLY_AND_NORMALIZE_PATTERN = /function applyLotToSlot\(slotIndex, lotObj\)\{[\s\S]*?function normalize\(d\)\{[\s\S]*?return \{ next \};[\s\S]*?\}/;
