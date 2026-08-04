"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NeudAlertModal } from "@/components/ui/NeudAlertModal";
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

export function LotPhotoThumbnails({
  projectId,
  lotNumber,
  canManage = false,
}: LotPhotoThumbnailsProps) {
  const [photos, setPhotos] = useState<LotPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    if (!shouldUseLocalDataClient() || !lotNumber.trim()) {
      setPhotos([]);
      return;
    }
    setLoading(true);
    try {
      const next = await getLotThumbnailPhotos(projectId, lotNumber);
      setPhotos(next.map(({ url, alt }) => ({ url, alt })));
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, lotNumber]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  async function persistOrder(nextPhotos: LotPhoto[]) {
    if (!canManage || !lotNumber.trim()) return;
    setBusy(true);
    try {
      await localReorderBagLotPhotos(
        projectId,
        lotNumber,
        nextPhotos.map((photo) => photo.url),
      );
      setPhotos(nextPhotos);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(photoUrl: string) {
    if (!canManage || !lotNumber.trim()) return;
    setPhotoToDelete(photoUrl);
  }

  async function confirmDeletePhoto() {
    if (!photoToDelete || !canManage || !lotNumber.trim()) return;
    setBusy(true);
    try {
      await localRemoveBagLotPhoto(projectId, lotNumber, photoToDelete);
      setPhotos((current) => current.filter((photo) => photo.url !== photoToDelete));
      setPhotoToDelete(null);
    } finally {
      setBusy(false);
    }
  }

  function movePhoto(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setPhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return current;
      next.splice(toIndex, 0, moved);
      void persistOrder(next);
      return next;
    });
  }

  async function handleAddPhotos() {
    if (!canManage || !lotNumber.trim()) return;
    const api = getDesktopAPI()?.offlineAuction;
    if (!api?.importLotPhotos) return;
    setBusy(true);
    try {
      const result = await api.importLotPhotos(projectId, lotNumber);
      if (result?.ok) {
        await loadPhotos();
      } else if (result && !result.cancelled && result.error) {
        setAlertMessage(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1 text-sm">
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
      {loading ? (
        <p className="text-xs text-muted">Loading photos…</p>
      ) : photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
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
      ) : (
        <p className="text-xs text-muted">No downloaded photos</p>
      )}
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
