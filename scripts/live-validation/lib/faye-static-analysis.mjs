import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cache");

function readCached(name) {
  const target = path.join(CACHE_DIR, name);
  if (!fs.existsSync(target)) {
    return null;
  }
  return fs.readFileSync(target, "utf8");
}

function extractSubscribeChannelsFromCapture(networkRequests) {
  const patterns = new Set();
  for (const entry of networkRequests ?? []) {
    const url = String(entry.urlPattern ?? "");
    if (!url.includes("faye.auctionaccelerate.com/faye")) {
      continue;
    }
    if (!url.includes("meta%2Fsubscribe") && !url.includes('"subscribe"')) {
      continue;
    }
    try {
      const parsed = new URL(url);
      const message = parsed.searchParams.get("message");
      if (!message) {
        continue;
      }
      const messages = JSON.parse(message);
      const list = Array.isArray(messages) ? messages : [messages];
      for (const item of list) {
        if (item?.channel === "/meta/subscribe" && item?.subscription) {
          patterns.add(sanitizeChannelPattern(String(item.subscription)));
        }
      }
    } catch {
      // ignore malformed capture rows
    }
  }
  return [...patterns];
}

function sanitizeChannelPattern(channel) {
  return channel
    .replace(/\/vehicles\/\d+/g, "/vehicles/{vehicleId}")
    .replace(/\/[0-9a-f-]{36}/gi, "/{id}")
    .replace(/\/\d{5,}/g, "/{numericId}");
}

function extractHandshakeFromCapture(networkRequests) {
  const handshakeUrl = (networkRequests ?? []).find((entry) =>
    String(entry.urlPattern ?? "").includes("faye.auctionaccelerate.com/faye") &&
    String(entry.urlPattern).includes("meta%2Fhandshake"),
  )?.urlPattern;

  if (!handshakeUrl) {
    return null;
  }

  try {
    const url = new URL(handshakeUrl);
    const message = url.searchParams.get("message");
    if (!message) {
      return { endpoint: "https://faye.auctionaccelerate.com/faye", parseError: "missing message param" };
    }
    const parsed = JSON.parse(message);
    const handshake = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
      endpoint: "https://faye.auctionaccelerate.com/faye",
      channel: handshake.channel ?? "/meta/handshake",
      version: handshake.version ?? null,
      supportedConnectionTypes: handshake.supportedConnectionTypes ?? [],
      clientIdPresent: false,
      note: "clientId returned in handshake response, not in request; do not persist response IDs",
    };
  } catch {
    return {
      endpoint: "https://faye.auctionaccelerate.com/faye",
      parseError: "unable to decode handshake message param",
    };
  }
}

export function analyzeFayeSyncScript(source) {
  if (!source) {
    return { available: false };
  }

  const vehicleBindFieldsMatch = source.match(/g=\[([^\]]+)\]/);
  const bindFields = vehicleBindFieldsMatch
    ? vehicleBindFieldsMatch[1]
        .split(",")
        .map((part) => part.replace(/"/g, "").trim())
        .filter(Boolean)
    : [];

  return {
    available: true,
    fayeClientConstruction: "new Faye.Client(FAYE_URL, { retry: 5 })",
    fayeEndpointVariable: "FAYE_URL (page global)",
    subscriptionChannels: [
      "/{DA_ACCOUNT}/actions",
      "/{DA_ACCOUNT}/vehicles/{vehicleId}",
    ],
    actionChannel: "/{DA_ACCOUNT}/actions",
    vehicleChannelPattern: "/{DA_ACCOUNT}/vehicles/{vehicleId}",
    actionTypes: ["change_car", "play_audio", "stop_audio", "raffle_on"],
    vehiclePayloadFields: bindFields,
    domUpdateMechanism:
      "Callback updates [data-bind=<field>] elements; fingerprints skip unchanged HTML",
    liveFieldMappings: {
      currentLotNumber: {
        fayeFields: ["lot", "lot_without_prefix"],
        domSelectors: ["[data-bind=lot]"],
      },
      currentLotTitle: {
        fayeFields: ["year", "make", "model", "sub_model", "title", "name", "short_description"],
        domSelectors: ['[data-bind=title]', ".vehicle-name [data-bind]"],
      },
      currentBid: {
        fayeFields: ["current_price"],
        domSelectors: ["[data-bind=current_price]", ".current_price"],
      },
      currencyConversions: {
        fayeFields: ["current_price", "additional_currency", "second_currency_price"],
        domSelectors: ["[data-bind=additional_currency]", ".other-currency .price"],
        formatter: "Formatters.additional_currency_price(current_price, element.data())",
      },
      soldState: {
        fayeFields: ["sold", "no_reserve", "reserves_off"],
        domSelectors: ["#js-sold", "#js-no-reserve", "#js-reserved-sm"],
      },
    },
    lotTransitionSequence: [
      "Faye /{DA_ACCOUNT}/actions message action=change_car",
      "unsubscribe prior /{DA_ACCOUNT}/vehicles/{oldId}",
      "set active vehicle id from message.active.id",
      "apply full vehicle payload to DOM (callback a)",
      "subscribe /{DA_ACCOUNT}/vehicles/{newId} with same callback",
    ],
    extensions: "No custom Faye auth extension detected in faye_sync bundle (client-side)",
  };
}

export function analyzeAuctionToteBoardScript(source) {
  if (!source) {
    return { available: false };
  }
  return {
    available: true,
    fayeIntegration: false,
    role: "Vehicle highlights carousel scrolling and title line-wrap CSS classes",
    domHooks: ["#vehicle-highlights-container", "#vehicle-highlights-inner", "h2.WrapTitle"],
    listensFor: ["afterVehicleUpdate window event (from faye_sync vehicle DOM updates)"],
    liveBidFields: "none — bid/lot/currency updates are handled in faye_sync-*.js",
  };
}

export function analyzeCurrencyFormatters(applicationSource) {
  if (!applicationSource) {
    return { available: false };
  }
  const hasAdditional = applicationSource.includes("additional_currency_price");
  const hasSecond = applicationSource.includes("second_currency_price");
  return {
    available: true,
    currenciesCalculatedClientSide: hasAdditional,
    additionalCurrencyFormula:
      "Formatters.additional_currency_price(bid, { currencyConversionRate, currencyCurrencySeparator, currencyCurrencySymbol })",
    secondCurrencyFormula:
      "Formatters.second_currency_price(bid) using SECOND_CURRENCY_PREFIX/SUFFIX globals",
    primaryCurrencyFromDom:
      "#primary-currency data(currency-currency-symbol, currency-currency-separator)",
    exchangeRateSource:
      "Per-currency element data attributes (currencyConversionRate), not separate XHR in faye_sync",
  };
}

export function buildFayeDiscovery(input = {}) {
  const fayeSync = readCached("faye_sync.js");
  const application = readCached("application.js");
  const toteBoard = readCached("auction_tote_board.js");
  const fayeSyncAnalysis = analyzeFayeSyncScript(fayeSync);
  const toteBoardAnalysis = analyzeAuctionToteBoardScript(toteBoard);
  const currencyAnalysis = analyzeCurrencyFormatters(application);
  const handshake = extractHandshakeFromCapture(input.networkRequests ?? []);
  const capturedSubscribeChannels = extractSubscribeChannelsFromCapture(input.networkRequests ?? []);

  const actualTransportFromCapture = inferTransportFromCapture(input.networkRequests ?? []);

  return {
    endpoint: "https://faye.auctionaccelerate.com/faye",
    handshake,
    capturedSubscribeChannels,
    actualTransport: actualTransportFromCapture,
    persistentConnection: actualTransportFromCapture.primary === "websocket",
    subscriptionChannels: fayeSyncAnalysis.subscriptionChannels ?? [],
    actionChannel: fayeSyncAnalysis.actionChannel ?? null,
    vehicleChannelPattern: fayeSyncAnalysis.vehicleChannelPattern ?? null,
    messageTypes: fayeSyncAnalysis.actionTypes ?? [],
    vehiclePayloadFields: fayeSyncAnalysis.vehiclePayloadFields ?? [],
    liveFieldMappings: fayeSyncAnalysis.liveFieldMappings ?? {},
    lotTransitionBehavior: {
      sequence: fayeSyncAnalysis.lotTransitionSequence ?? [],
      lotTransitionRequiresAdditionalFetch: false,
      note: "change_car delivers r.active payload inline; no extra HTTP fetch required in faye_sync",
    },
    currencyBehavior: currencyAnalysis,
    authentication: {
      mechanism:
        "Browser session on bagauction-jumbotron host; Faye channels scoped by window.DA_ACCOUNT and vehicle IDs",
      fayePublic: false,
      reliesOnBrowserCookies: "likely for auction origin; Faye cross-origin uses JSONP/long-poll/WebSocket handshake",
      independentClientRisk:
        "Direct NEUD Faye client must replicate authenticated session/channel authorization; safer to observe via Puppeteer page",
      subscriptionAuthorization: "Channel names include account slug and vehicle id; not global public feed",
    },
    fastPathFeasibility: {
      fayeCarriesCurrentLot: true,
      fayeCarriesTitle: true,
      fayeCarriesBid: true,
      fayeCarriesCurrencies: true,
      currenciesCalculatedClientSide: currencyAnalysis.currenciesCalculatedClientSide ?? true,
      lotTransitionRequiresAdditionalFetch: false,
      eliminateBidDisplayGotoSteadyState: true,
      eliminateVehicleListSteadyStateForLiveBid: true,
      note: "Vehicle list still needed for next lots / catalog unless separately cached",
    },
    passiveListenerOptions: [
      {
        option: "B. Observe Faye messages via authenticated Puppeteer page",
        latency: "best",
        reliability: "high",
        complexity: "medium",
        authenticationRisk: "low",
        siteChangeResilience: "medium",
      },
      {
        option: "C. MutationObserver on bid/lot/currency DOM",
        latency: "high",
        reliability: "high",
        complexity: "low-medium",
        authenticationRisk: "low",
        siteChangeResilience: "medium-high",
      },
      {
        option: "A. Chrome DevTools Protocol WebSocket/frame listener",
        latency: "best",
        reliability: "medium-high",
        complexity: "medium",
        authenticationRisk: "low",
        siteChangeResilience: "medium",
      },
      {
        option: "D. Independent NEUD Faye client",
        latency: "best if auth works",
        reliability: "uncertain",
        complexity: "high",
        authenticationRisk: "high",
        siteChangeResilience: "low",
      },
    ],
    recommendedFastPath:
      "B. Observe Faye vehicle-channel and /actions messages through a persistent authenticated Bid Display Puppeteer page (or CDP frame tap). Avoid per-poll goto/reload; optionally add MutationObserver as secondary confirmation.",
    estimatedAchievableLiveLatencyMs: {
      bestCase: 250,
      expected: 400,
      worstNormal: 900,
      evidence:
        "DOM update is driven directly from Faye callbacks; message-to-DOM latency requires live capture (not yet measured in NEUD artifact)",
    },
    messageToDomLatency: input.messageToDomLatency ?? {
      sampleCount: 0,
      note: "Run live Faye+DOM correlation capture during active bidding to populate min/median/p95/max",
    },
    auctionToteBoard: toteBoardAnalysis,
    staticScriptSources: {
      fayeSyncCached: Boolean(fayeSync),
      auctionToteBoardCached: Boolean(toteBoard),
      note: "Primary Faye/tote logic lives in faye_sync-*.js; auction_tote_board-*.js handles highlight scrolling UI",
    },
  };
}

function inferTransportFromCapture(requests) {
  const faye = (requests ?? []).filter((entry) =>
    String(entry.urlPattern ?? "").includes("faye.auctionaccelerate.com/faye"),
  );
  const jsonp = faye.some((entry) => /jsonp=/.test(String(entry.urlPattern)));
  const websocket = (requests ?? []).some((entry) => entry.resourceType === "websocket");
  const longPoll = faye.some((entry) =>
    /meta%2Fconnect|"connect"/i.test(String(entry.urlPattern)),
  );

  let primary = "unknown";
  if (websocket) {
    primary = "websocket";
  } else if (jsonp) {
    primary = "callback-polling (JSONP handshake observed)";
  } else if (longPoll) {
    primary = "long-polling";
  }

  return {
    primary,
    websocketObserved: websocket,
    jsonpHandshakeObserved: jsonp,
    longPollingObserved: longPoll,
    eventsourceObserved: (requests ?? []).some(
      (entry) => entry.category === "eventsource" || entry.resourceType === "eventsource",
    ),
    captureNote:
      "Captured scrape used JSONP handshake; transport may upgrade to WebSocket after handshake within same session",
  };
}
