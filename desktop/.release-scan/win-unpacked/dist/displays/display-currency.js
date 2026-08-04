"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_CURRENCY_ORDER = void 0;
exports.formatCurrencyValue = formatCurrencyValue;
exports.formatCurrencyValueWithSymbol = formatCurrencyValueWithSymbol;
exports.formatDisplayCurrencyRow = formatDisplayCurrencyRow;
exports.buildDisplayCurrenciesFromUsd = buildDisplayCurrenciesFromUsd;
exports.parseDisplayCurrencyEntry = parseDisplayCurrencyEntry;
exports.normalizeDisplayCurrencies = normalizeDisplayCurrencies;
exports.formatDisplayCurrencyRowsForPylon = formatDisplayCurrencyRowsForPylon;
exports.buildManualBidCurrencyDisplayStrings = buildManualBidCurrencyDisplayStrings;
const currency_rate_service_1 = require("../services/currency-rate-service");
exports.DISPLAY_CURRENCY_ORDER = [...currency_rate_service_1.SUPPORTED_CURRENCY_CODES];
function formatThousandsEnUs(value) {
    return new Intl.NumberFormat("en-US", {
        style: "decimal",
        maximumFractionDigits: 0,
    }).format(Math.round(value));
}
function formatThousandsForSource(value, code, source) {
    const rounded = Math.round(value);
    const digits = String(Math.abs(rounded));
    if (source === "local-controller") {
        if (code === "EUR") {
            return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
        if (code === "CHF") {
            return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
        }
    }
    return formatThousandsEnUs(rounded);
}
function formatCurrencyValue(input) {
    const rawValue = Math.round(input.value);
    const grouped = formatThousandsForSource(rawValue, input.code, input.source);
    if (input.source === "local-controller") {
        return {
            rawValue,
            formattedValue: grouped,
            icon: null,
        };
    }
    switch (input.code) {
        case "EUR":
            return { rawValue, formattedValue: `€${grouped}`, icon: "€" };
        case "GBP":
            return { rawValue, formattedValue: `£${grouped}`, icon: "£" };
        case "CHF":
            return { rawValue, formattedValue: grouped, icon: null };
        case "JPY":
            return { rawValue, formattedValue: `¥${grouped}`, icon: "¥" };
        default:
            return { rawValue, formattedValue: grouped, icon: null };
    }
}
/** @deprecated Prefer formatCurrencyValue with an explicit source. */
function formatCurrencyValueWithSymbol(code, amount) {
    return formatCurrencyValue({
        code,
        value: amount,
        source: "webpage-scraper",
    }).formattedValue;
}
function formatDisplayCurrencyRow(currency) {
    const code = currency.code.trim().toUpperCase();
    const value = currency.formattedValue.trim();
    if (!code) {
        return value;
    }
    if (!value) {
        return "";
    }
    if (value.toUpperCase().startsWith(`${code} `)) {
        return value;
    }
    if (code === "CHF" && /^CHF\b/i.test(value)) {
        return value;
    }
    return `${code} ${value}`;
}
function parseNumericToken(raw) {
    let normalized = raw
        .trim()
        .replace(/^[€£¥$]+/, "")
        .replace(/^CHF\s+/i, "")
        .trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
        normalized = normalized.replace(/\./g, "");
    }
    else if (/^\d{1,3}('\d{3})+$/.test(normalized)) {
        normalized = normalized.replace(/'/g, "");
    }
    else if (/^\d{1,3}(,\d{3})+$/.test(normalized)) {
        normalized = normalized.replace(/,/g, "");
    }
    else {
        normalized = normalized.replace(/[^\d.-]/g, "");
    }
    if (!normalized)
        return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}
function isValidDisplayCurrency(currency) {
    if (!currency.code.trim())
        return false;
    if (!currency.formattedValue.trim())
        return false;
    if (!/\d/.test(currency.formattedValue))
        return false;
    if (currency.rawValue != null && currency.rawValue <= 0)
        return false;
    return true;
}
function buildDisplayCurrenciesFromUsd(amountUsd, rates, source = "local-controller") {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        return [];
    }
    return exports.DISPLAY_CURRENCY_ORDER.map((code) => {
        const numericValue = (0, currency_rate_service_1.convertUsdAmount)(amountUsd, rates.rates[code]);
        const formatted = formatCurrencyValue({ code, value: numericValue, source });
        return {
            code,
            rawValue: formatted.rawValue,
            formattedValue: formatted.formattedValue,
            icon: formatted.icon,
        };
    }).filter(isValidDisplayCurrency);
}
function parseDisplayCurrencyEntry(entry, positionalCode, source = "webpage-scraper") {
    const trimmed = entry.trim();
    if (!trimmed)
        return null;
    const codedMatch = trimmed.match(/^([A-Z]{3})\b[:\s-]*(.+)$/i);
    if (codedMatch) {
        const code = codedMatch[1].toUpperCase();
        const remainder = codedMatch[2].trim();
        const numericValue = parseNumericToken(remainder);
        const hasScraperSymbol = remainder.startsWith("€") ||
            remainder.startsWith("£") ||
            remainder.startsWith("¥") ||
            /^CHF\b/i.test(remainder);
        let formattedValue = remainder;
        let icon = null;
        if (numericValue != null &&
            numericValue > 0 &&
            source === "local-controller" &&
            !hasScraperSymbol) {
            const formatted = formatCurrencyValue({ code, value: numericValue, source });
            formattedValue = formatted.formattedValue;
            icon = formatted.icon;
        }
        else if (numericValue != null && numericValue > 0 && hasScraperSymbol) {
            if (remainder.startsWith("€"))
                icon = "€";
            if (remainder.startsWith("£"))
                icon = "£";
            if (remainder.startsWith("¥"))
                icon = "¥";
        }
        else if (numericValue != null && numericValue > 0 && !hasScraperSymbol) {
            formattedValue = formatCurrencyValue({
                code,
                value: numericValue,
                source,
            }).formattedValue;
        }
        return {
            code,
            formattedValue,
            rawValue: numericValue,
            icon,
        };
    }
    if (!positionalCode) {
        return null;
    }
    const numericValue = parseNumericToken(trimmed);
    if (numericValue == null || numericValue <= 0) {
        return null;
    }
    const formatted = formatCurrencyValue({
        code: positionalCode,
        value: numericValue,
        source,
    });
    return {
        code: positionalCode,
        formattedValue: formatted.formattedValue,
        rawValue: formatted.rawValue,
        icon: formatted.icon,
    };
}
function normalizeDisplayCurrencies(rows, source = "webpage-scraper") {
    if (!Array.isArray(rows))
        return [];
    const parsed = [];
    const seen = new Set();
    for (let index = 0; index < rows.length; index += 1) {
        const entry = rows[index];
        if (typeof entry !== "string")
            continue;
        const positionalCode = exports.DISPLAY_CURRENCY_ORDER[index];
        const currency = parseDisplayCurrencyEntry(entry, positionalCode, source);
        if (!currency || !isValidDisplayCurrency(currency))
            continue;
        const code = currency.code.toUpperCase();
        if (seen.has(code))
            continue;
        seen.add(code);
        parsed.push(currency);
    }
    const ordered = [];
    for (const code of exports.DISPLAY_CURRENCY_ORDER) {
        const match = parsed.find((entry) => entry.code.toUpperCase() === code);
        if (match)
            ordered.push(match);
    }
    return ordered;
}
function formatDisplayCurrencyRowsForPylon(rows, source = "webpage-scraper") {
    return normalizeDisplayCurrencies(rows, source)
        .map(formatDisplayCurrencyRow)
        .filter(Boolean)
        .slice(0, exports.DISPLAY_CURRENCY_ORDER.length);
}
function buildManualBidCurrencyDisplayStrings(amountUsd, rates) {
    return buildDisplayCurrenciesFromUsd(amountUsd, rates, "local-controller").map(formatDisplayCurrencyRow);
}
