"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCurrencyRatesIpc = registerCurrencyRatesIpc;
const channels_1 = require("./channels");
function registerCurrencyRatesIpc(currencyRates) {
    (0, channels_1.registerIpcHandler)("neud:currency:getRates", () => {
        return currencyRates.getRates();
    });
    (0, channels_1.registerIpcHandler)("neud:currency:refreshIfStale", async () => {
        return currencyRates.refreshRatesIfStale();
    });
    (0, channels_1.registerIpcHandler)("neud:currency:refreshNow", async () => {
        return currencyRates.refreshRatesNow();
    });
}
