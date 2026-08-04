import type { LocalDataService } from "../services/local-data-service";
import { getSenderWindow } from "./credentials";
import { registerIpcHandler } from "./channels";

export function registerDisplayDataSourceIpc(data: LocalDataService) {
  registerIpcHandler("neud:displayDataSource:get", () => {
    return data.getDisplayDataSource();
  });

  registerIpcHandler("neud:displayDataSource:set", (_event, source: unknown) => {
    return data.setDisplayDataSource(source);
  });

  registerIpcHandler("neud:displayDataSource:subscribe", (event) => {
    const window = getSenderWindow(event);
    if (window) {
      data.subscribeDisplayDataSource(window);
    }
  });

  registerIpcHandler("neud:displayDataSource:unsubscribe", (event) => {
    const window = getSenderWindow(event);
    if (window) {
      data.unsubscribeDisplayDataSource(window);
    }
  });
}
