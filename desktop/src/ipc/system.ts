import { registerIpcHandler } from "./channels";
import { collectPerformanceMetrics } from "../services/performance-metrics-service";

export function registerSystemIpc() {
  registerIpcHandler("neud:system:performanceMetrics", () => collectPerformanceMetrics());
}
