import {
  isBlockedAuctionOrigin,
  resolveExportEditUrl,
} from "./bag-edit-url-resolution.js";
import {
  normalizeEditPageReserveStatus,
  serializeEditPageReserveForStorage,
} from "./bag-reserve-status.js";

export function absUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function extractVehicleIdFromUrl(url) {
  const match = String(url).match(/\/vehicles\/(\d+)\/edit(?:[?#].*)?$/i);
  return match?.[1] ?? null;
}

export function createLotDetailError(stage, message, meta = {}) {
  const error = new Error(message);
  error.name = "LotDetailError";
  error.stage = stage;
  error.meta = meta;
  return error;
}

function isCheckboxInput(element) {
  return Boolean(
    element &&
      String(element.tagName || "").toUpperCase() === "INPUT" &&
      element.type === "checkbox" &&
      "checked" in element,
  );
}

function isTextInput(element) {
  return Boolean(
    element &&
      String(element.tagName || "").toUpperCase() === "INPUT" &&
      "value" in element,
  );
}

export function parseLotDetailPageDocument(doc) {
  const readCheckbox = (selector) => {
    const element = doc.querySelector(selector);
    return isCheckboxInput(element) ? Boolean(element.checked) : null;
  };

  const sold = readCheckbox("#vehicle_sold");
  const noReserve = readCheckbox("#vehicle_no_reserve");
  const reservesOff = readCheckbox("#vehicle_reserves_off");

  const reservePriceElement = doc.querySelector("#vehicle_reserve_price");
  const reservePriceRaw = isTextInput(reservePriceElement)
    ? String(reservePriceElement.value ?? "").trim()
    : null;

  const reservePrice =
    reservePriceRaw !== null &&
    reservePriceRaw !== "" &&
    Number.isFinite(Number(reservePriceRaw))
      ? Number(reservePriceRaw)
      : null;

  const photoUrls = Array.from(doc.querySelectorAll("#photos-list img"))
    .map((image) =>
      image.getAttribute("src")?.trim() ||
      image.getAttribute("data-src")?.trim() ||
      image.getAttribute("data-original")?.trim() ||
      null,
    )
    .filter(Boolean);

  const reserveStatus = normalizeEditPageReserveStatus({ noReserve });

  const currentPriceElement = doc.querySelector("#vehicle_current_price");
  const currentPrice = isTextInput(currentPriceElement)
    ? String(currentPriceElement.value ?? "").trim()
    : "";

  return {
    sold,
    noReserve,
    reservesOff,
    reservePrice,
    reservePriceRaw,
    reserveStatus,
    currentPrice,
    photoUrls,
    detailUrl: doc.defaultView?.location?.href ?? "",
    diagnostics: {
      soldSelectorFound: Boolean(doc.querySelector("#vehicle_sold")),
      noReserveSelectorFound: Boolean(doc.querySelector("#vehicle_no_reserve")),
      reservesOffSelectorFound: Boolean(doc.querySelector("#vehicle_reserves_off")),
      reservePriceSelectorFound: Boolean(doc.querySelector("#vehicle_reserve_price")),
      photoContainerFound: Boolean(doc.querySelector("#photos-list")),
      photoSelectorMatches: doc.querySelectorAll("#photos-list img").length,
      photoUrlsExtracted: photoUrls.length,
    },
  };
}

export function parseLotDetailPageFromDocument() {
  function isCheckboxInput(element) {
    return Boolean(
      element &&
        String(element.tagName || "").toUpperCase() === "INPUT" &&
        element.type === "checkbox" &&
        "checked" in element,
    );
  }

  function isTextInput(element) {
    return Boolean(
      element &&
        String(element.tagName || "").toUpperCase() === "INPUT" &&
        "value" in element,
    );
  }

  function normalizeEditPageReserveStatus(noReserve) {
    if (noReserve === true) return "no-reserve";
    if (noReserve === false) return "reserve";
    return "unknown";
  }

  const doc = document;
  const readCheckbox = (selector) => {
    const element = doc.querySelector(selector);
    return isCheckboxInput(element) ? Boolean(element.checked) : null;
  };

  const sold = readCheckbox("#vehicle_sold");
  const noReserve = readCheckbox("#vehicle_no_reserve");
  const reservesOff = readCheckbox("#vehicle_reserves_off");

  const reservePriceElement = doc.querySelector("#vehicle_reserve_price");
  const reservePriceRaw = isTextInput(reservePriceElement)
    ? String(reservePriceElement.value ?? "").trim()
    : null;

  const reservePrice =
    reservePriceRaw !== null &&
    reservePriceRaw !== "" &&
    Number.isFinite(Number(reservePriceRaw))
      ? Number(reservePriceRaw)
      : null;

  const photoUrls = Array.from(doc.querySelectorAll("#photos-list img"))
    .map((image) =>
      image.getAttribute("src")?.trim() ||
      image.getAttribute("data-src")?.trim() ||
      image.getAttribute("data-original")?.trim() ||
      null,
    )
    .filter(Boolean);

  const reserveStatus = normalizeEditPageReserveStatus(noReserve);

  const currentPriceElement = doc.querySelector("#vehicle_current_price");
  const currentPrice = isTextInput(currentPriceElement)
    ? String(currentPriceElement.value ?? "").trim()
    : "";

  return {
    sold,
    noReserve,
    reservesOff,
    reservePrice,
    reservePriceRaw,
    reserveStatus,
    currentPrice,
    photoUrls,
    detailUrl: window.location.href,
    diagnostics: {
      soldSelectorFound: Boolean(doc.querySelector("#vehicle_sold")),
      noReserveSelectorFound: Boolean(doc.querySelector("#vehicle_no_reserve")),
      reservesOffSelectorFound: Boolean(doc.querySelector("#vehicle_reserves_off")),
      reservePriceSelectorFound: Boolean(doc.querySelector("#vehicle_reserve_price")),
      photoContainerFound: Boolean(doc.querySelector("#photos-list")),
      photoSelectorMatches: doc.querySelectorAll("#photos-list img").length,
      photoUrlsExtracted: photoUrls.length,
    },
  };
}

async function detectLoginPage(page) {
  return page.evaluate(() => {
    const path = window.location.pathname.toLowerCase();
    return (
      path.includes("sign_in") ||
      path.includes("/login") ||
      Boolean(document.querySelector('form[action*="sign_in"]'))
    );
  });
}

async function detectEditForm(page) {
  return page.evaluate(() => ({
    editFormFound: Boolean(document.querySelector("form.edit_vehicle")),
    soldFieldFound: Boolean(document.querySelector("#vehicle_sold")),
    photoListFound: Boolean(document.querySelector("#photos-list")),
    noReserveFieldFound: Boolean(document.querySelector("#vehicle_no_reserve")),
  }));
}

export async function fetchLotDetailData(page, editUrl, options = {}) {
  const sourceEditUrl = editUrl;
  const shouldAbort =
    typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;
  if (shouldAbort()) {
    throw createLotDetailError("cancelled", "Export cancelled.", {
      sourceEditUrl,
      resolvedEditUrl: editUrl,
    });
  }

  if (!editUrl) {
    throw createLotDetailError("url-resolution", "Lot detail URL was missing.", {
      sourceEditUrl: null,
      resolvedEditUrl: null,
    });
  }

  const resolvedEditUrl =
    options.auctionUrl && typeof options.auctionUrl === "string"
      ? resolveExportEditUrl(editUrl, options.auctionUrl) ?? editUrl
      : editUrl;

  if (isBlockedAuctionOrigin(resolvedEditUrl)) {
    throw createLotDetailError(
      "url-resolution",
      "Unsupported Lot Details URL protocol or host.",
      { sourceEditUrl, resolvedEditUrl },
    );
  }

  const timeout = Number(options.timeout ?? 30000);
  const login = typeof options.login === "function" ? options.login : null;

  let response;
  try {
    response = await page.goto(resolvedEditUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });
  } catch (error) {
    throw createLotDetailError(
      "navigation",
      error instanceof Error ? error.message : "Lot detail navigation failed.",
      {
        sourceEditUrl,
        resolvedEditUrl,
        navigationStatus: null,
        finalUrl: page.url(),
        navigationCompleted: false,
      },
    );
  }

  if (shouldAbort()) {
    throw createLotDetailError("cancelled", "Export cancelled.", {
      sourceEditUrl,
      resolvedEditUrl,
    });
  }

  let navigationStatus = response?.status?.() ?? null;
  let finalUrl = page.url();
  let pageTitle = await page.title().catch(() => "");
  let loginPageDetected = await detectLoginPage(page);

  const navigationMeta = {
    sourceEditUrl,
    resolvedEditUrl,
    navigationStatus,
    finalUrl,
    pageTitle,
    loginPageDetected,
    navigationCompleted: true,
  };

  if (loginPageDetected) {
    if (!login) {
      throw createLotDetailError(
        "authentication",
        "Lot Details page redirected to sign-in.",
        {
          ...navigationMeta,
          loginPageDetected: true,
        },
      );
    }

    await login();
    response = await page.goto(resolvedEditUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    navigationStatus = response?.status?.() ?? navigationStatus;
    finalUrl = page.url();
    pageTitle = await page.title().catch(() => "");
    loginPageDetected = await detectLoginPage(page);

    if (loginPageDetected) {
      throw createLotDetailError(
        "authentication",
        "Lot Details page redirected to sign-in.",
        {
          ...navigationMeta,
          navigationStatus,
          finalUrl,
          pageTitle,
          loginPageDetected: true,
        },
      );
    }
  }

  navigationMeta.navigationStatus = navigationStatus;
  navigationMeta.finalUrl = finalUrl;
  navigationMeta.pageTitle = pageTitle;
  navigationMeta.loginPageDetected = loginPageDetected;

  if (navigationStatus != null && navigationStatus >= 400) {
    throw createLotDetailError(
      "http-status",
      `Lot Details page returned HTTP ${navigationStatus}.`,
      navigationMeta,
    );
  }

  try {
    await page.waitForSelector("form.edit_vehicle, #vehicle_lot, #photos-list", {
      timeout: 10000,
    });
  } catch {
    // Continue with post-navigation inspection.
  }

  const pageKind = await detectEditForm(page);
  if (!pageKind.editFormFound) {
    throw createLotDetailError(
      "redirect",
      "Lot Details page did not contain the expected edit form.",
      {
        ...navigationMeta,
        pageKind,
      },
    );
  }

  let details;
  try {
    details = await page.evaluate(parseLotDetailPageFromDocument);
  } catch (error) {
    throw createLotDetailError(
      "parse",
      error instanceof Error ? error.message : "Lot detail parser failed.",
      {
        ...navigationMeta,
        pageKind,
        editFormFound: true,
      },
    );
  }

  const vehicleId = extractVehicleIdFromUrl(finalUrl || resolvedEditUrl);

  return {
    sold: details.sold,
    noReserve: details.noReserve,
    reservesOff: details.reservesOff,
    reservePrice: details.reservePrice,
    reservePriceRaw: details.reservePriceRaw,
    currentPrice: details.currentPrice,
    photoUrls: details.photoUrls,
    photoSelectorMatches: details.diagnostics.photoSelectorMatches,
    detailUrl: finalUrl,
    vehicleId,
    sourceEditUrl,
    resolvedEditUrl,
    reserveStatus: serializeEditPageReserveForStorage(details.reserveStatus),
    reserveRawText:
      details.noReserve === true
        ? "No reserve"
        : details.noReserve === false
          ? "Has reserve"
          : undefined,
    reserveSelectorMatched:
      details.diagnostics.noReserveSelectorFound ||
      details.diagnostics.reservesOffSelectorFound ||
      details.diagnostics.reservePriceSelectorFound,
    diagnostics: {
      ...details.diagnostics,
      editFormFound: pageKind.editFormFound,
      navigationStatus,
      finalUrl,
      pageTitle,
      loginPageDetected,
    },
    navigation: {
      navigationStatus,
      finalUrl,
      pageTitle,
      loginPageDetected,
      pageKind,
    },
    parserSucceeded: true,
  };
}
