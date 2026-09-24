"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NeudAlertModal } from "@/components/ui/NeudAlertModal";
import {
  logPhotoTransitionDiagnostics,
  type PhotoTransitionDiagnosticSnapshot,
} from "@/lib/bag/controller-photo-transition-diagnostics";
import { getProjectScrollContainer } from "@/lib/portal/project-scroll-container";
import { getLotThumbnailPhotos } from "@/lib/desktop/auction-dataset-client";
import {
  localRemoveBagLotPhoto,
  localReorderBagLotPhotos,
} from "@/lib/local/bag-api";
import { getDesktopAPI } from "@/lib/desktop/client";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type LotPhoto = {
  url: string;
  alt: string;
};

type LotPhotoThumbnailsProps = {
  projectId: string;
  lotNumber: string;
  canManage?: boolean;
};

const PHOTO_CROSSFADE_MS = 200;

function preloadPhotoUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}

function measureScrollFrame() {
  const container = getProjectScrollContainer();
  if (!container) {
    return null;
  }
  return {
    scrollHeight: container.scrollHeight,
    scrollTop: container.scrollTop,
    scrollbarPresent: container.scrollHeight > container.clientHeight + 1,
  };
}

export function LotPhotoThumbnails({
  projectId,
  lotNumber,
  canManage = false,
}: LotPhotoThumbnailsProps) {
  const [visiblePhotos, setVisiblePhotos] = useState<LotPhoto[]>([]);
  const [visibleLotNumber, setVisibleLotNumber] = useState(lotNumber);
  const [incomingPhotos, setIncomingPhotos] = useState<LotPhoto[] | null>(null);
  const [incomingOpacity, setIncomingOpacity] = useState(0);
  const [panelMinHeight, setPanelMinHeight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const transitionTokenRef = useRef(0);
  const initialLoadRef = useRef(true);

  const capturePanelHeight = useCallback(() => {
    const height = panelRef.current?.offsetHeight ?? 0;
    if (height > 0) {
      setPanelMinHeight(height);
    }
    return height;
  }, []);

  const commitPhotoSwap = useCallback(
    (nextPhotos: LotPhoto[], targetLot: string, diagnostics: Partial<PhotoTransitionDiagnosticSnapshot>) => {
      setIncomingPhotos(nextPhotos);
      setIncomingOpacity(0);
      requestAnimationFrame(() => {
        setIncomingOpacity(1);
        window.setTimeout(() => {
          setVisiblePhotos(nextPhotos);
          setVisibleLotNumber(targetLot);
          setIncomingPhotos(null);
          setIncomingOpacity(0);
          requestAnimationFrame(() => {
            const afterFrame = measureScrollFrame();
            const panelHeightAfter = panelRef.current?.offsetHeight ?? 0;
            logPhotoTransitionDiagnostics({
              targetLot: targetLot,
              oldPhotoCount: diagnostics.oldPhotoCount ?? 0,
              newPhotoCount: nextPhotos.length,
              photoPanelHeightBefore: diagnostics.photoPanelHeightBefore ?? 0,
              photoPanelHeightDuring: diagnostics.photoPanelHeightDuring ?? 0,
              photoPanelHeightAfter: panelHeightAfter,
              scrollHeightBefore: diagnostics.scrollHeightBefore ?? 0,
              scrollHeightDuring: diagnostics.scrollHeightDuring ?? 0,
              scrollHeightAfter: afterFrame?.scrollHeight ?? 0,
              scrollTopBefore: diagnostics.scrollTopBefore ?? 0,
              scrollTopDuring: diagnostics.scrollTopDuring ?? 0,
              scrollTopAfter: afterFrame?.scrollTop ?? 0,
              scrollbarPresentBefore: diagnostics.scrollbarPresentBefore ?? false,
              scrollbarPresentDuring: diagnostics.scrollbarPresentDuring ?? false,
              scrollbarPresentAfter: afterFrame?.scrollbarPresent ?? false,
              firstNewImageReadyAt: diagnostics.firstNewImageReadyAt ?? null,
              photoSwapAt: new Date().toISOString(),
            });
            if (panelHeightAfter > 0) {
              setPanelMinHeight(panelHeightAfter);
            }
          });
        }, PHOTO_CROSSFADE_MS);
      });
    },
    [],
  );

  const resolvePhotosForLot = useCallback(
    async (targetLot: string) => {
      if (!shouldUseLocalDataClient() || !targetLot.trim()) {
        return [] as LotPhoto[];
      }
      const next = await getLotThumbnailPhotos(projectId, targetLot);
      return next.map(({ url, alt }) => ({ url, alt }));
    },
    [projectId],
  );

  const loadPhotosForLot = useCallback(
    async (targetLot: string, options?: { initial?: boolean }) => {
      if (!shouldUseLocalDataClient() || !targetLot.trim()) {
        if (options?.initial) {
          setVisiblePhotos([]);
          setVisibleLotNumber(targetLot);
        }
        return;
      }

      const token = ++transitionTokenRef.current;
      const beforeFrame = measureScrollFrame();
      const photoPanelHeightBefore = capturePanelHeight();
      const oldPhotoCount = visiblePhotos.length;

      if (!options?.initial && targetLot !== visibleLotNumber) {
        capturePanelHeight();
      }

      try {
        const nextPhotos = await resolvePhotosForLot(targetLot);
        if (token !== transitionTokenRef.current) {
          return;
        }

        if (nextPhotos.length > 0) {
          await preloadPhotoUrl(nextPhotos[0]!.url);
        }

        const firstNewImageReadyAt = new Date().toISOString();
        const duringFrame = measureScrollFrame();
        const photoPanelHeightDuring = panelRef.current?.offsetHeight ?? photoPanelHeightBefore;

        if (options?.initial || targetLot === visibleLotNumber) {
          setVisiblePhotos(nextPhotos);
          setVisibleLotNumber(targetLot);
          setIncomingPhotos(null);
          setPanelMinHeight(null);
          requestAnimationFrame(() => capturePanelHeight());
          return;
        }

        commitPhotoSwap(nextPhotos, targetLot, {
          oldPhotoCount,
          photoPanelHeightBefore,
          photoPanelHeightDuring,
          scrollHeightBefore: beforeFrame?.scrollHeight ?? 0,
          scrollHeightDuring: duringFrame?.scrollHeight ?? 0,
          scrollTopBefore: beforeFrame?.scrollTop ?? 0,
          scrollTopDuring: duringFrame?.scrollTop ?? 0,
          scrollbarPresentBefore: beforeFrame?.scrollbarPresent ?? false,
          scrollbarPresentDuring: duringFrame?.scrollbarPresent ?? false,
          firstNewImageReadyAt,
        });
      } catch {
        if (token !== transitionTokenRef.current) {
          return;
        }
        if (options?.initial) {
          setVisiblePhotos([]);
          setVisibleLotNumber(targetLot);
        }
      }
    },
    [capturePanelHeight, commitPhotoSwap, resolvePhotosForLot, visibleLotNumber, visiblePhotos.length],
  );

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      void loadPhotosForLot(lotNumber, { initial: true });
      return;
    }
    if (lotNumber === visibleLotNumber && lotNumber.trim()) {
      return;
    }
    void loadPhotosForLot(lotNumber);
  }, [loadPhotosForLot, lotNumber, visibleLotNumber]);

  async function persistOrder(nextPhotos: LotPhoto[]) {
    if (!canManage || !visibleLotNumber.trim()) return;
    setBusy(true);
    try {
      await localReorderBagLotPhotos(
        projectId,
        visibleLotNumber,
        nextPhotos.map((photo) => photo.url),
      );
      setVisiblePhotos(nextPhotos);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(photoUrl: string) {
    if (!canManage || !visibleLotNumber.trim()) return;
    setPhotoToDelete(photoUrl);
  }

  async function confirmDeletePhoto() {
    if (!photoToDelete || !canManage || !visibleLotNumber.trim()) return;
    setBusy(true);
    try {
      await localRemoveBagLotPhoto(projectId, visibleLotNumber, photoToDelete);
      setVisiblePhotos((current) => current.filter((photo) => photo.url !== photoToDelete));
      setPhotoToDelete(null);
    } finally {
      setBusy(false);
    }
  }

  function movePhoto(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setVisiblePhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return current;
      next.splice(toIndex, 0, moved);
      void persistOrder(next);
      return next;
    });
  }

  async function handleAddPhotos() {
    if (!canManage || !visibleLotNumber.trim()) return;
    const api = getDesktopAPI()?.offlineAuction;
    if (!api?.importLotPhotos) return;
    setBusy(true);
    try {
      const result = await api.importLotPhotos(projectId, visibleLotNumber);
      if (result?.ok) {
        await loadPhotosForLot(visibleLotNumber, { initial: true });
      } else if (result && !result.cancelled && result.error) {
        setAlertMessage(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const photosToRender = incomingPhotos ?? visiblePhotos;
  const isTransitioning = incomingPhotos !== null && lotNumber !== visibleLotNumber;

  function renderPhotoGrid(photos: LotPhoto[], layerClassName: string) {
    if (photos.length === 0) {
      return null;
    }
    return (
      <div className={`flex flex-wrap gap-2 ${layerClassName}`}>
        {photos.map((photo, index) => (
          <div
            key={photo.url}
            className={`relative rounded-md border border-border bg-surface ${
              busy ? "opacity-70" : ""
            }`}
          >
            <img
              src={photo.url}
              alt={photo.alt}
              width={96}
              height={72}
              className="h-[72px] w-24 rounded-md object-cover"
            />
            {canManage ? (
              <div className="flex items-center justify-between gap-1 border-t border-border px-1 py-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || index === 0}
                  aria-label="Move photo earlier"
                  onClick={() => movePhoto(index, index - 1)}
                >
                  ←
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label="Delete photo"
                  onClick={() => handleDelete(photo.url)}
                >
                  ✕
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || index === photos.length - 1}
                  aria-label="Move photo later"
                  onClick={() => movePhoto(index, index + 1)}
                >
                  →
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="relative grid min-h-[6.5rem] gap-1 text-sm"
      style={panelMinHeight ? { minHeight: panelMinHeight } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">Downloaded Photos</span>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !lotNumber.trim()}
            onClick={() => void handleAddPhotos()}
          >
            Add Photos
          </Button>
        ) : null}
      </div>

      <div className="relative">
        {isTransitioning ? (
          <>
            {renderPhotoGrid(visiblePhotos, "relative z-0")}
            <div
              className="absolute inset-0 z-10 transition-opacity"
              style={{
                opacity: incomingOpacity,
                transitionDuration: `${PHOTO_CROSSFADE_MS}ms`,
              }}
            >
              {renderPhotoGrid(photosToRender, "")}
            </div>
            <div className="pointer-events-none absolute inset-0 z-20 bg-background/10" aria-hidden />
          </>
        ) : photosToRender.length > 0 ? (
          renderPhotoGrid(photosToRender, "")
        ) : (
          <p className="text-xs text-muted">No downloaded photos</p>
        )}
      </div>

      {photoToDelete ? (
        <ConfirmDialog
          title="Remove Photo?"
          description="Remove this photo from the lot display?"
          confirmLabel="Remove Photo"
          confirmVariant="destructive"
          onCancel={() => setPhotoToDelete(null)}
          onConfirm={confirmDeletePhoto}
        />
      ) : null}
      {alertMessage ? (
        <NeudAlertModal
          title="Unable to Add Photos"
          description={alertMessage}
          variant="error"
          onClose={() => setAlertMessage(null)}
        />
      ) : null}
    </div>
  );
}
