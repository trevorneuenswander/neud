/** Puppeteer bridge installation for Broad Arrow live feed observation. */

export const NEUD_LIVE_BRIDGE_GLOBAL = "__NEUD_LIVE_AUCTION_EVENT__";

export function getLiveFeedBridgeBootstrapScript() {
  return `
(function () {
  if (window.__NEUD_LIVE_BRIDGE_BOOTSTRAP__) return;
  window.__NEUD_LIVE_BRIDGE_BOOTSTRAP__ = true;
  window.__NEUD_LIVE_BRIDGE_ACCEPT__ = true;

  function cleanText(value) {
    return String(value || "").replace(/\\s+/g, " ").trim();
  }

  function readDisplaySnapshot() {
    var lot = cleanText(document.querySelector(".lot-number .value")?.textContent);
    var year = cleanText(
      document.querySelector('.vehicle-name [data-bind="year"], .vehicle-name .Year')?.textContent,
    );
    var title = cleanText(document.querySelector('.vehicle-name [data-bind="title"]')?.textContent);
    var biddingPrice = cleanText(document.querySelector(".current_price")?.textContent);
    var reserveStatus =
      cleanText(document.querySelector("#js-no-reserve.visible")?.textContent) ||
      cleanText(document.querySelector("#js-reserved-sm.visible")?.textContent) ||
      "";
    var currencies = Array.from(document.querySelectorAll(".other-currency .price")).map(function (el) {
      return cleanText(el.textContent);
    });
    var photos = Array.from(document.querySelectorAll("#images img"))
      .map(function (img) {
        return img.getAttribute("src") || img.currentSrc || "";
      })
      .filter(Boolean);
    var vehicleRoot = document.querySelector(".MainWrapper");
    var vehicleId = vehicleRoot ? String(vehicleRoot.getAttribute("data-id") || "") : "";
    return {
      lotNumber: lot,
      year: year,
      title: title,
      biddingPrice: biddingPrice,
      reserveStatus: reserveStatus,
      currencies: currencies,
      photos: photos,
      vehicleId: vehicleId || null,
    };
  }

  function emitLiveEvent(source, eventType, hint) {
    if (window.__NEUD_LIVE_BRIDGE_ACCEPT__ === false) {
      return;
    }
    if (typeof window.${NEUD_LIVE_BRIDGE_GLOBAL} !== "function") {
      return;
    }
    var observedAt = Date.now();
    requestAnimationFrame(function () {
      var snapshot = readDisplaySnapshot();
      window.${NEUD_LIVE_BRIDGE_GLOBAL}({
        receivedAt: observedAt,
        source: source,
        eventType: eventType || "vehicle_update",
        vehicleId: hint && hint.id ? String(hint.id) : snapshot.vehicleId,
        lotNumber: snapshot.lotNumber,
        year: snapshot.year,
        title: snapshot.title,
        biddingPrice: snapshot.biddingPrice,
        reserveStatus: snapshot.reserveStatus,
        currencies: snapshot.currencies,
        photos: snapshot.photos && snapshot.photos.length ? snapshot.photos : undefined,
      });
    });
  }

  function installFayeHooks() {
    window.fayeCallbacks = window.fayeCallbacks || {};
    ["change_car", "play_audio", "stop_audio", "raffle_on"].forEach(function (action) {
      window.fayeCallbacks[action] = window.fayeCallbacks[action] || { before: [], after: [] };
    });

    window.fayeCallbacks.change_car.after.push(function (message) {
      emitLiveEvent("faye", "change_car", message && message.active ? message.active : null);
    });

    if (window.jQuery) {
      window.jQuery(window).on("afterVehicleUpdate", function (_event, payload) {
        emitLiveEvent("faye", "vehicle_update", payload || null);
      });
    }
  }

  function installDomObserver() {
    if (window.__NEUD_DOM_OBSERVER__) return;
    var targets = [
      document.querySelector(".current_price"),
      document.querySelector(".lot-number .value"),
      document.querySelector('.vehicle-name [data-bind="title"]'),
      document.querySelector(".other-currency .price"),
    ].filter(Boolean);
    if (!targets.length) return;
    var pending = null;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        emitLiveEvent("dom", "dom_mutation", null);
      });
    });
    targets.forEach(function (node) {
      observer.observe(node, { childList: true, characterData: true, subtree: true });
    });
    window.__NEUD_DOM_OBSERVER__ = observer;
  }

  function waitForReady() {
    if (!window.jQuery) {
      setTimeout(waitForReady, 50);
      return;
    }
    installFayeHooks();
    installDomObserver();
    window.__NEUD_LIVE_FEED_READY__ = true;
    emitLiveEvent("faye", "bridge_ready", null);
  }

  waitForReady();
})();
`.trim();
}

export async function disableLiveFeedBridgeOnPage(page) {
  if (!page) {
    return;
  }
  try {
    await page.evaluate(() => {
      window.__NEUD_LIVE_BRIDGE_ACCEPT__ = false;
    });
  } catch {
    // page may already be closing
  }
}

export async function installLiveFeedBridgeOnPage(page, onLiveEvent) {
  if (!page || typeof onLiveEvent !== "function") {
    throw new Error("Live feed bridge requires a page and event handler.");
  }

  await page.exposeFunction(NEUD_LIVE_BRIDGE_GLOBAL, async (payload) => {
    await onLiveEvent(payload);
  });

  await page.evaluateOnNewDocument(getLiveFeedBridgeBootstrapScript());

  try {
    await page.evaluate(getLiveFeedBridgeBootstrapScript());
  } catch {
    // Page may not be ready; bootstrap retries via waitForReady.
  }
}
