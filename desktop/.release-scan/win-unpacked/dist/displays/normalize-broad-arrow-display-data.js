"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBroadArrowDisplayData = normalizeBroadArrowDisplayData;
const lower_ticker_data_1 = require("./lower-ticker-data");
const pylon_data_1 = require("./pylon-data");
function normalizeBroadArrowDisplayData(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return null;
    }
    const pylonFeed = (0, pylon_data_1.mapSnapshotToPylonFeed)(snapshot);
    const tickerFeed = (0, lower_ticker_data_1.mapSnapshotToLowerTickerFeed)(snapshot);
    return {
        pylon: pylonFeed.auctionDisplay,
        ticker: tickerFeed,
        updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null,
        dataSource: typeof snapshot.dataSource === "string" ? snapshot.dataSource : "webpage-scraper",
    };
}
