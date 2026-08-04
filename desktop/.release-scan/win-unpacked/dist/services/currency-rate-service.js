"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildManualBidCurrencyDisplayStrings = exports.CurrencyRateService = exports.RATE_REFRESH_INTERVAL_MS = exports.SUPPORTED_CURRENCY_CODES = void 0;
exports.convertUsdAmount = convertUsdAmount;
exports.formatConvertedAmount = formatConvertedAmount;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const neud_env_1 = require("../env/neud-env");
exports.SUPPORTED_CURRENCY_CODES = ["EUR", "GBP", "CHF", "JPY"];
exports.RATE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RATES = {
    base: "USD",
    rates: {
        EUR: 0.92,
        GBP: 0.79,
        CHF: 0.88,
        JPY: 150,
    },
    updatedAt: "1970-01-01T00:00:00.000Z",
};
function ratesFilePath(paths) {
    return path_1.default.join(paths.root, "currency-rates.json");
}
function readCachedRates(paths) {
    const filePath = ratesFilePath(paths);
    if (!fs_1.default.existsSync(filePath)) {
        return DEFAULT_RATES;
    }
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(filePath, "utf8"));
        if (parsed.base !== "USD" || !parsed.rates || typeof parsed.updatedAt !== "string") {
            return DEFAULT_RATES;
        }
        const rates = {};
        for (const code of exports.SUPPORTED_CURRENCY_CODES) {
            const value = parsed.rates[code];
            rates[code] = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_RATES.rates[code];
        }
        return {
            base: "USD",
            rates,
            updatedAt: parsed.updatedAt,
        };
    }
    catch {
        return DEFAULT_RATES;
    }
}
function writeCachedRates(paths, rates) {
    fs_1.default.mkdirSync(paths.root, { recursive: true });
    fs_1.default.writeFileSync(ratesFilePath(paths), JSON.stringify(rates, null, 2), "utf8");
}
async function fetchRatesFromProvider() {
    const apiKey = (0, neud_env_1.NEUD_CURRENCY_API_KEY)();
    const targetCodes = exports.SUPPORTED_CURRENCY_CODES.join(",");
    const url = apiKey
        ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/USD`
        : `https://api.frankfurter.app/latest?from=USD&to=${targetCodes}`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            return null;
        const payload = (await response.json());
        const conversionRates = payload.conversion_rates ??
            payload.rates;
        if (!conversionRates)
            return null;
        const rates = {};
        for (const code of exports.SUPPORTED_CURRENCY_CODES) {
            const value = conversionRates[code];
            if (typeof value !== "number" || !Number.isFinite(value)) {
                return null;
            }
            rates[code] = value;
        }
        return {
            base: "USD",
            rates,
            updatedAt: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
}
class CurrencyRateService {
    paths;
    refreshPromise = null;
    constructor(paths) {
        this.paths = paths;
    }
    getRates() {
        return readCachedRates(this.paths);
    }
    async refreshRatesIfStale() {
        return readCachedRates(this.paths);
    }
    async refreshRatesNow() {
        if (!this.refreshPromise) {
            this.refreshPromise = this.refreshRates().finally(() => {
                this.refreshPromise = null;
            });
        }
        return this.refreshPromise;
    }
    async refreshRates() {
        const cached = readCachedRates(this.paths);
        const fetched = await fetchRatesFromProvider();
        if (fetched) {
            writeCachedRates(this.paths, fetched);
            return fetched;
        }
        return cached;
    }
}
exports.CurrencyRateService = CurrencyRateService;
function convertUsdAmount(amountUsd, rate) {
    return Math.round(amountUsd * rate);
}
function formatConvertedAmount(amountUsd, _currency, rate) {
    const converted = convertUsdAmount(amountUsd, rate);
    return new Intl.NumberFormat("en-US", {
        style: "decimal",
        maximumFractionDigits: 0,
    }).format(converted);
}
var display_currency_1 = require("../displays/display-currency");
Object.defineProperty(exports, "buildManualBidCurrencyDisplayStrings", { enumerable: true, get: function () { return display_currency_1.buildManualBidCurrencyDisplayStrings; } });
