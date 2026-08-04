import type { CurrencyRateService } from "../services/currency-rate-service";
import { registerIpcHandler } from "./channels";

export function registerCurrencyRatesIpc(currencyRates: CurrencyRateService) {
  registerIpcHandler("neud:currency:getRates", () => {
    return currencyRates.getRates();
  });

  registerIpcHandler("neud:currency:refreshIfStale", async () => {
    return currencyRates.refreshRatesIfStale();
  });

  registerIpcHandler("neud:currency:refreshNow", async () => {
    return currencyRates.refreshRatesNow();
  });
}
