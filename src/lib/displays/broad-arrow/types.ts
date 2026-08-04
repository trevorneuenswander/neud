import type { LowerTickerLot } from "@/lib/displays/lower-ticker-data";
import type { PylonAuctionDisplay } from "@/lib/displays/pylon-data";

export type BroadArrowDisplayData = {
  pylon: PylonAuctionDisplay;
  ticker: {
    next: LowerTickerLot[];
  };
  updatedAt: string | null;
  dataSource: string;
};

export const EMPTY_BROAD_ARROW_DISPLAY_DATA: BroadArrowDisplayData = {
  pylon: {
    lot: "Lot —",
    title: "",
    year: "",
    reserveStatus: "",
    biddingPrice: "",
    currencies: [],
    photos: [],
  },
  ticker: {
    next: [],
  },
  updatedAt: null,
  dataSource: "webpage-scraper",
};
