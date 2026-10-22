"use client";

import { useMemo, useState } from "react";
import {
  PROJECT_ASSET_CATEGORIES,
  type ProjectAsset,
  type ProjectAssetCategory,
} from "@/lib/editor/project-assets";

type AssetLibraryPanelProps = {
  assets: ProjectAsset[];
  busy?: boolean;
  resolveThumbnailUrl: (asset: ProjectAsset) => string;
  onUpload: (file: File, category: ProjectAssetCategory) => void;
  onChoose: (asset: ProjectAsset) => void;
  onRename: (assetId: string, name: string) => void;
  onDelete: (assetId: string) => void;
  usedAssetIds: Set<string>;
};

export function AssetLibraryPanel({
  assets,
  busy,
  resolveThumbnailUrl,
  onUpload,
  onChoose,
  onRename,
  onDelete,
  usedAssetIds,
}: AssetLibraryPanelProps) {
  const [category, setCategory] = useState<ProjectAssetCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return assets.filter((asset) => {
      if (category !== "all" && asset.category !== category) return false;
      if (query.trim() && !asset.name.toLowerCase().includes(query.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [assets, category, query]);

  return (
    <div className="space-y-2 p-2 text-xs">
      <div className="flex gap-1">
        <input
          type="search"
          placeholder="Search assets"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="cursor-pointer rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-900">
          Upload
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file, category === "all" ? "image" : category);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`rounded px-1.5 py-0.5 ${category === "all" ? "bg-neutral-800" : ""}`}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        {PROJECT_ASSET_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`rounded px-1.5 py-0.5 ${category === entry.id ? "bg-neutral-800" : ""}`}
            onClick={() => setCategory(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <ul className="max-h-[min(420px,50vh)] space-y-2 overflow-auto">
        {filtered.length === 0 ? (
          <li className="text-neutral-500">No assets yet — upload or import an image.</li>
        ) : (
          filtered.map((asset) => (
            <li
              key={asset.id}
              className="flex gap-2 rounded border border-neutral-800 p-2 hover:bg-neutral-900/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveThumbnailUrl(asset)}
                alt=""
                className="h-12 w-12 shrink-0 rounded border border-neutral-700 object-contain bg-neutral-950"
              />
              <div className="min-w-0 flex-1">
                <input
                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-neutral-700"
                  value={asset.name}
                  onChange={(event) => onRename(asset.id, event.target.value)}
                />
                <div className="text-[10px] text-neutral-500">{asset.relativePath}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded border border-neutral-700 px-1.5 py-0.5"
                    onClick={() => onChoose(asset)}
                  >
                    Choose
                  </button>
                  {!usedAssetIds.has(asset.id) && !usedAssetIds.has(asset.relativePath) ? (
                    pendingDelete === asset.id ? (
                      <>
                        <button
                          type="button"
                          className="rounded border border-red-800 px-1.5 py-0.5 text-red-300"
                          onClick={() => {
                            onDelete(asset.id);
                            setPendingDelete(null);
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="rounded border border-neutral-700 px-1.5 py-0.5"
                          onClick={() => setPendingDelete(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-1.5 py-0.5"
                        onClick={() => setPendingDelete(asset.id)}
                      >
                        Delete
                      </button>
                    )
                  ) : (
                    <span className="text-[10px] text-neutral-600">In use</span>
                  )}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
