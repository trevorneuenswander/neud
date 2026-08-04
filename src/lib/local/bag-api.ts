import { getLocalApiBaseUrl } from "@/lib/local/mode";
import type {
  BagBidCalculatorPreview,
  BagControllerInfo,
  BagLiveStateEnvelope,
  BagLiveStateUpdatedEvent,
} from "@/lib/bag/types";

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getLocalApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? `Local API request failed (${response.status}).`);
  }

  return payload;
}

export async function localGetBagLiveState(projectId: string) {
  return localFetch<BagLiveStateEnvelope>(
    `/api/projects/${encodeURIComponent(projectId)}/bag/live`,
  );
}

export async function localGetBagControllerInfo(projectId: string) {
  return localFetch<BagControllerInfo>(
    `/api/projects/${encodeURIComponent(projectId)}/bag/controller`,
  );
}

export function subscribeToBagLiveState(
  projectId: string,
  onUpdate: (event: BagLiveStateUpdatedEvent) => void,
): () => void {
  const source = new EventSource(
    `${getLocalApiBaseUrl()}/api/projects/${encodeURIComponent(projectId)}/bag/live/events`,
  );

  source.addEventListener("bag.live-state.updated", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as BagLiveStateUpdatedEvent;
      onUpdate(payload);
    } catch {
      // ignore malformed events
    }
  });

  return () => {
    source.close();
  };
}

function manualPost<T>(projectId: string, path: string, body?: Record<string, unknown>) {
  return localFetch<T>(`/api/projects/${encodeURIComponent(projectId)}/bag/manual/${path}`, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function localEnterBagManualMode(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "enter");
}

export async function localExitBagManualMode(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "exit");
}

export async function localSelectBagPreviousLot(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "previous");
}

export async function localSelectBagNextLot(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "next");
}

export async function localLoadLotForEditing(
  projectId: string,
  input: {
    lotNumber: string;
    title: string;
    reserveStatus: string;
    currentBid?: number | null;
    currentBidLabel?: string;
    stableId: string;
  },
) {
  return manualPost<BagLiveStateEnvelope>(projectId, "load-lot", input);
}

export async function localSelectBagLot(projectId: string, lotIdentifier: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "select", { lotIdentifier });
}

export async function localPatchBagManualLot(
  projectId: string,
  patch: {
    lotNumber?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    reserveStatus?: string;
  },
) {
  return localFetch<BagLiveStateEnvelope>(
    `/api/projects/${encodeURIComponent(projectId)}/bag/manual/lot`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export async function localSetBagManualBid(projectId: string, bid: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "bid", { bid });
}

export async function localAdjustBagManualBid(projectId: string, delta: number) {
  return manualPost<BagLiveStateEnvelope>(projectId, "bid/adjust", { delta });
}

export async function localPreviewBagBidCalculator(projectId: string, expression: string) {
  return manualPost<BagBidCalculatorPreview>(projectId, "bid/calculate", { expression });
}

export async function localApplyBagBidCalculator(projectId: string, expression: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "bid/apply-calculator", { expression });
}

export async function localSubmitBagManualLot(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "submit/lot");
}

export async function localSubmitBagManualBid(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "submit/bid");
}

export async function localReorderBagLotPhotos(
  projectId: string,
  lotNumber: string,
  photoUrls: string[],
) {
  return manualPost<BagLiveStateEnvelope>(projectId, "lot/photos/reorder", {
    lotNumber,
    photoUrls,
  });
}

export async function localRemoveBagLotPhoto(
  projectId: string,
  lotNumber: string,
  photoUrl: string,
) {
  return manualPost<BagLiveStateEnvelope>(projectId, "lot/photos/remove", {
    lotNumber,
    photoUrl,
  });
}

export async function localSetBagManualLotStatus(projectId: string, status: "sold" | "passed") {
  return manualPost<BagLiveStateEnvelope>(projectId, "status", { status });
}

export async function localClearBagManualLotStatus(projectId: string) {
  return manualPost<BagLiveStateEnvelope>(projectId, "status/clear");
}
