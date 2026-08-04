"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBagRoute = handleBagRoute;
async function handleBagRoute(request, response, url, ctx) {
    const projectIdMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/bag\/(.+)$/);
    if (!projectIdMatch)
        return false;
    const projectId = decodeURIComponent(projectIdMatch[1]);
    const subpath = projectIdMatch[2];
    if (!ctx.bagLiveState.projectExists(projectId)) {
        sendJson(response, 404, { error: "Project not found." });
        return true;
    }
    if (!ctx.bagLiveState.isBagGraphicsProject(projectId)) {
        sendJson(response, 400, {
            error: "BAG live state is only available for bag-graphics projects.",
        });
        return true;
    }
    if (subpath === "live" && request.method === "GET") {
        const envelope = ctx.bagLiveState.getLiveStateEnvelope(projectId);
        sendJson(response, 200, envelope ?? { state: null }, true);
        return true;
    }
    if (subpath === "live/events" && request.method === "GET") {
        handleLiveEvents(request, response, projectId, ctx);
        return true;
    }
    if (subpath === "controller" && request.method === "GET") {
        sendJson(response, 200, ctx.bagLiveState.getControllerInfo(projectId, ctx.baseUrl), true);
        return true;
    }
    if (subpath.startsWith("manual/")) {
        return await handleManualRoute(request, response, subpath.slice("manual/".length), projectId, ctx);
    }
    sendJson(response, 404, { error: "Not found." });
    return true;
}
function handleLiveEvents(request, response, projectId, ctx) {
    response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
    });
    response.write(": connected\n\n");
    const send = (event) => {
        response.write(`event: ${event.type}\n`);
        response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const current = ctx.bagLiveState.getLiveStateEnvelope(projectId);
    if (current) {
        send({
            type: "bag.live-state.updated",
            projectId,
            state: current.state,
            automaticState: current.automaticState,
            automaticComparison: current.automaticComparison,
            manualSession: current.manualSession,
            latestScrapedCurrentLot: current.latestScrapedCurrentLot,
            localControllerDraft: current.localControllerDraft,
            localControllerSubmitted: current.localControllerSubmitted,
            manualLotNavigation: current.manualLotNavigation,
            manualLotNavigationCapabilities: current.manualLotNavigationCapabilities,
        });
    }
    const unsubscribe = ctx.bagEvents.subscribe(projectId, send);
    const heartbeat = setInterval(() => {
        response.write(": heartbeat\n\n");
    }, 15000);
    request.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
}
async function handleManualRoute(request, response, subpath, projectId, ctx) {
    try {
        ctx.requireControlAccess();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Authentication required.";
        const status = message.includes("Sign in") || message.includes("Authentication")
            ? 401
            : 403;
        sendJson(response, status, { error: message });
        return true;
    }
    const actor = ctx.getActor();
    const activityActor = {
        id: actor.id ?? undefined,
        name: actor.name?.trim() || actor.email?.split("@")[0] || "Unknown User",
        email: actor.email ?? undefined,
    };
    if (subpath === "enter" && request.method === "POST") {
        const result = ctx.bagLiveState.enterManualMode(projectId, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "exit" && request.method === "POST") {
        const result = ctx.bagLiveState.exitManualMode(projectId, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "previous" && request.method === "POST") {
        const result = ctx.bagLiveState.selectPreviousLot(projectId, actor);
        if (result.ok) {
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.lot.navigation",
                message: "Local Controller moved to previous lot draft",
                metadata: {
                    lotNumber: result.envelope.localControllerDraft?.lotNumber ?? null,
                },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "next" && request.method === "POST") {
        const result = ctx.bagLiveState.selectNextLot(projectId, actor);
        if (result.ok) {
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.lot.navigation",
                message: "Local Controller moved to next lot draft",
                metadata: {
                    lotNumber: result.envelope.localControllerDraft?.lotNumber ?? null,
                },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "load-lot" && request.method === "POST") {
        const body = await readJsonBody(request);
        const lotNumber = readString(body, "lotNumber", "lot_number");
        const title = readOptionalString(body, "title", "title") ?? "";
        const reserveStatus = readOptionalString(body, "reserveStatus", "reserve_status") ?? "";
        const stableId = readString(body, "stableId", "stable_id");
        if (!lotNumber || !stableId) {
            sendJson(response, 400, { error: "lotNumber and stableId are required." });
            return true;
        }
        const currentBid = typeof body.currentBid === "number"
            ? body.currentBid
            : typeof body.current_bid === "number"
                ? body.current_bid
                : null;
        const currentBidLabel = readString(body, "currentBidLabel", "current_bid_label") ?? "";
        const result = ctx.bagLiveState.loadLotForEditing(projectId, {
            lotNumber,
            title: title ?? "",
            reserveStatus: reserveStatus ?? "",
            currentBid,
            currentBidLabel,
            stableId,
        }, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "select" && request.method === "POST") {
        const body = await readJsonBody(request);
        const lotIdentifier = readString(body, "lotIdentifier", "lot_identifier");
        if (!lotIdentifier) {
            sendJson(response, 400, { error: "lotIdentifier is required." });
            return true;
        }
        const result = ctx.bagLiveState.selectLot(projectId, lotIdentifier, actor);
        if (result.ok) {
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.lot.navigation",
                message: `Local Controller jumped to lot ${lotIdentifier.trim()} draft`,
                metadata: { lotIdentifier: lotIdentifier.trim() },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "lot" && request.method === "PATCH") {
        const body = await readJsonBody(request);
        const patch = {
            lotNumber: readOptionalString(body, "lotNumber", "lot_number"),
            title: readOptionalString(body, "title", "title"),
            description: readOptionalString(body, "description", "description"),
            imageUrl: readOptionalString(body, "imageUrl", "image_url"),
            reserveStatus: readOptionalString(body, "reserveStatus", "reserve_status"),
        };
        const result = ctx.bagLiveState.applyManualLotPatch(projectId, patch, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "lot/photos/reorder" && request.method === "POST") {
        const body = await readJsonBody(request);
        const lotNumber = readString(body, "lotNumber", "lot_number");
        const photoUrls = Array.isArray(body.photoUrls)
            ? body.photoUrls.filter((entry) => typeof entry === "string")
            : [];
        if (!lotNumber) {
            sendJson(response, 400, { error: "lotNumber is required." });
            return true;
        }
        const result = ctx.bagLiveState.updateDraftLotPhotoOrder(projectId, lotNumber, photoUrls, actor);
        if (result.ok) {
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.lot.photos",
                message: "Lot photo order updated",
                metadata: { lotNumber: lotNumber.trim() },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "lot/photos/remove" && request.method === "POST") {
        const body = await readJsonBody(request);
        const lotNumber = readString(body, "lotNumber", "lot_number");
        const photoUrl = readString(body, "photoUrl", "photo_url");
        if (!lotNumber || !photoUrl) {
            sendJson(response, 400, { error: "lotNumber and photoUrl are required." });
            return true;
        }
        const result = ctx.bagLiveState.removeDraftLotPhoto(projectId, lotNumber, photoUrl, actor);
        if (result.ok) {
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.lot.photos",
                message: "Lot photo reference removed",
                metadata: { lotNumber: lotNumber.trim() },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "lot/photos/add" && request.method === "POST") {
        const body = await readJsonBody(request);
        const lotNumber = readString(body, "lotNumber", "lot_number");
        const photoUrls = Array.isArray(body.photoUrls)
            ? body.photoUrls.filter((entry) => typeof entry === "string")
            : [];
        if (!lotNumber || photoUrls.length === 0) {
            sendJson(response, 400, { error: "lotNumber and photoUrls are required." });
            return true;
        }
        const result = ctx.bagLiveState.addDraftLotPhotos(projectId, lotNumber, photoUrls, actor);
        if (result.ok) {
            ctx.recordActivity?.({
                type: "controller.lot.photos-added",
                message: `Added ${photoUrls.length} lot photo(s)`,
                userAction: `added ${photoUrls.length} lot photo(s)`,
                metadata: { projectId, lotNumber: lotNumber.trim() },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "submit/lot" && request.method === "POST") {
        const result = ctx.bagLiveState.submitManualLot(projectId, actor);
        if (result.ok) {
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.lot.submitted",
                message: "Manual lot submitted to Local Controller",
                metadata: {
                    lotNumber: result.envelope.localControllerSubmitted?.currentLot?.lotNumber ?? null,
                },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "submit/bid" && request.method === "POST") {
        const result = ctx.bagLiveState.submitManualBid(projectId, actor);
        if (result.ok) {
            const bidAmount = result.envelope.localControllerSubmitted?.currentLot?.currentBid ??
                result.envelope.state.currentLot?.currentBid ??
                null;
            const bidLabel = result.envelope.localControllerSubmitted?.currentLot?.currentBidLabel ??
                result.envelope.state.currentLot?.currentBidLabel ??
                "—";
            ctx.recordLog?.({
                level: "info",
                eventType: "controller.bid.submitted",
                message: `Manual bid submitted to Local Controller JSON: ${bidLabel}`,
                metadata: { bidAmount, bidLabel },
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "bid" && request.method === "POST") {
        const body = await readJsonBody(request);
        const bid = readString(body, "bid", "bid");
        if (!bid) {
            sendJson(response, 400, { error: "bid is required." });
            return true;
        }
        const result = ctx.bagLiveState.setManualBid(projectId, bid, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "bid/adjust" && request.method === "POST") {
        const body = await readJsonBody(request);
        const delta = readNumber(body, "delta", "delta");
        if (delta === null) {
            sendJson(response, 400, { error: "delta is required." });
            return true;
        }
        const result = ctx.bagLiveState.adjustManualBid(projectId, delta, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "bid/calculate" && request.method === "POST") {
        const body = await readJsonBody(request);
        const expression = readString(body, "expression", "expression");
        if (!expression) {
            sendJson(response, 400, { error: "expression is required." });
            return true;
        }
        const preview = ctx.bagLiveState.previewBidCalculator(projectId, expression);
        if (!preview.ok) {
            sendJson(response, 400, { error: preview.error });
            return true;
        }
        sendJson(response, 200, preview, true);
        return true;
    }
    if (subpath === "bid/apply-calculator" && request.method === "POST") {
        const body = await readJsonBody(request);
        const expression = readString(body, "expression", "expression");
        if (!expression) {
            sendJson(response, 400, { error: "expression is required." });
            return true;
        }
        const result = ctx.bagLiveState.applyBidCalculator(projectId, expression, actor);
        return sendManualResult(response, result);
    }
    if (subpath === "status" && request.method === "POST") {
        const body = await readJsonBody(request);
        const status = readString(body, "status", "status");
        if (status !== "sold" && status !== "passed") {
            sendJson(response, 400, { error: 'status must be "sold" or "passed".' });
            return true;
        }
        const result = ctx.bagLiveState.setManualLotStatus(projectId, status, actor);
        if (result.ok) {
            ctx.recordActivity?.({
                type: "controller.lot-status",
                message: `Local Controller marked lot as ${status}`,
                userAction: `Local Controller marked lot as ${status}`,
                actor: activityActor,
                source: "local-controller",
            });
        }
        return sendManualResult(response, result);
    }
    if (subpath === "status/clear" && request.method === "POST") {
        const result = ctx.bagLiveState.clearManualLotStatus(projectId, actor);
        if (result.ok) {
            ctx.recordActivity?.({
                type: "controller.lot-status",
                message: "Local Controller cleared lot status",
                userAction: "Local Controller cleared lot status",
                actor: activityActor,
                source: "local-controller",
            });
        }
        return sendManualResult(response, result);
    }
    sendJson(response, 404, { error: "Not found." });
    return true;
}
function sendManualResult(response, result) {
    if (!result.ok) {
        sendJson(response, 400, { error: result.error });
        return true;
    }
    sendJson(response, 200, result.envelope, true);
    return true;
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0)
        return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function readString(body, camelKey, snakeKey) {
    const value = body[camelKey] ?? body[snakeKey];
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function readOptionalString(body, camelKey, snakeKey) {
    const value = body[camelKey] ?? body[snakeKey];
    return typeof value === "string" ? value : undefined;
}
function readNumber(body, camelKey, snakeKey) {
    const value = body[camelKey] ?? body[snakeKey];
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function sendJson(response, status, payload, noStore = false) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        ...(noStore ? { "Cache-Control": "no-store" } : {}),
    });
    response.end(JSON.stringify(payload));
}
