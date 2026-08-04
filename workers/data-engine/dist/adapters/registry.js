import { createBagAuctionAdapter } from "./bag-auction.js";
import { createGenericWebpageAdapter } from "./generic-webpage.js";

export function getAdapter(engine) {
  const adapterName = engine.config?.adapter;

  if (typeof adapterName !== "string" || !adapterName.trim()) {
    throw new Error(
      "No scraper adapter is configured. Set a valid adapter before starting the engine.",
    );
  }

  if (adapterName === "bag-auction") {
    return createBagAuctionAdapter();
  }

  if (adapterName === "generic-webpage") {
    return createGenericWebpageAdapter();
  }

  throw new Error(`Unsupported adapter: ${adapterName}`);
}
