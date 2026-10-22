"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";
import { getDesktopAPI } from "@/lib/desktop/client";
import { alignLayers, distributeLayers } from "@/lib/editor/align-distribute";
import { mergeBrandKit, SAMPLE_SEMA_BRAND_KIT, type ProjectBrandKit } from "@/lib/editor/brand-kit";
import { createHistoryFrame, inferHistoryLabel, type EditorHistoryFrame } from "@/lib/editor/editor-history";
import {
  assetCategoryFromFilename,
  createProjectAssetId,
  assetKindFromFilename,
  upsertProjectAsset,
  type ProjectAsset,
  type ProjectAssetCategory,
} from "@/lib/editor/project-assets";
import {
  snapMove,
  snapResize,
  type SpacingMeasurement,
  type SmartGuide,
} from "@/lib/editor/smart-guides";
import {
  deleteNamedDraft,
  duplicateNamedDraft,
  listNamedDrafts,
  renameNamedDraft,
  saveNamedDraft,
  type NamedEditorDraft,
} from "@/lib/editor/named-drafts";
import { parseExpressionToTokens, resolveExpressionText } from "@/lib/editor/inline-text-tokens";
import { resolveFontFamily, COMMON_EDITOR_FONTS } from "@/lib/editor/font-management";
import {
  GRAPHIC_DATA_NAMESPACES,
  listReadyDataLeaves,
  normalizeDataBindingPath,
  type GraphicDataNode,
} from "@/lib/editor/graphic-data-registry";
import {
  cloneSchema,
  createEmptyLayer,
  createLayerId,
  type EditableAnimPreset,
  type EditableGraphicSchema,
  type EditableLayer,
  type EditableLayerType,
  type EditableOverflowMode,
  type EditableTextAlign,
} from "@/lib/editor/editable-graphic-types";
import {
  ZOOM_PRESETS,
  clampZoom,
  createViewTransform,
  fitZoomToViewport,
  stepZoom,
  type EditorViewTransform,
} from "@/lib/editor/view-transform";
import {
  displayAssetUrl,
  LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE,
  localGetEditableGraphicSchema,
  localImportDisplayAsset,
  localSaveEditableGraphicSchema,
  primeDisplayAssetUrlBase,
} from "@/lib/local/editable-graphic-api";
import { desktopTitleBarCssHeight } from "@/lib/desktop/shell-capabilities";
import { localDuplicateDeveloperDisplay } from "@/lib/local/developer-tools-api";
import { localFetch } from "@/lib/local/api";
import {
  EditorEllipseIcon,
  EditorImageIcon,
  EditorLineIcon,
  EditorRectIcon,
  EditorRedoIcon,
  EditorSelectIcon,
  EditorTextIcon,
  EditorUndoIcon,
  EditorZoomInIcon,
  EditorZoomOutIcon,
} from "@/components/editor/editor-toolbar-icons";
import {
  clientToCanvasPoint,
  computeShapeDrawBounds,
  hitTestTopLayer,
  isShapeDrawLargeEnough,
  type EditorCanvasTool,
} from "@/lib/editor/canvas-tools";
import {
  handleInnerStyle,
  handleStyle,
  rotationHandleInnerStyle,
  rotationHandleStyle,
  rotationStemStyle,
  selectionFrameStyle,
  type ResizeHandleId,
} from "@/lib/editor/transform-handles";
import { CollapsibleSection } from "@/components/editor/CollapsibleSection";
import { ColorField } from "@/components/editor/ColorField";
import { DataBindingBadge } from "@/components/editor/DataBindingBadge";
import { TransformHud } from "@/components/editor/TransformHud";
import {
  clearAutosaveSnapshot,
  createAutosaveWriter,
  readAutosaveSnapshot,
} from "@/lib/editor/autosave-recovery";
import { estimateGraphicBudget } from "@/lib/editor/layer-performance";
import {
  buildNeudGraphicPackage,
  parseNeudGraphicPackage,
  serializeNeudGraphicPackage,
} from "@/lib/editor/neudgraphic-package";
import type { SampleScenario } from "@/lib/editor/phase4-types";
import { EditorHistoryPanel } from "@/components/editor/EditorHistoryPanel";
import { EditorRulers } from "@/components/editor/EditorRulers";
import { AssetLibraryPanel } from "@/components/editor/AssetLibraryPanel";
import { EditorDesignPanel } from "@/components/editor/EditorDesignPanel";
import { NamedDraftsPanel } from "@/components/editor/NamedDraftsPanel";
import { VersionCompareModal } from "@/components/editor/VersionCompareModal";
import { InlineTokenEditor } from "@/components/editor/InlineTokenEditor";
import type { EditableGuide } from "@/lib/editor/editable-graphic-types";
import {
  isGuideOffCanvas,
  removeGuide,
  updateGuidePosition,
} from "@/lib/editor/rulers";

type GraphicEditorClientProps = {
  projectId: string;
  displayId: string;
  projectSlug: string;
};

type SchedulePreview = {
  now?: { title?: string; description?: string } | null;
  next?: { title?: string; description?: string } | null;
  later?: { title?: string; description?: string } | null;
};

type DragMode = "move" | "resize" | "rotate" | null;

type ShapeDrawState = {
  tool: "rect" | "ellipse";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  shiftKey: boolean;
  altKey: boolean;
};

const SNAP_THRESHOLD = 12;
const DATA_LEAVES = listReadyDataLeaves();

function resolveBindingText(schedule: SchedulePreview, binding?: string): string {
  const normalized = normalizeDataBindingPath(binding);
  if (!normalized) return "";
  const [slot, field] = normalized.split(".") as [keyof SchedulePreview, "title" | "description"];
  const row = schedule[slot];
  if (!row) return "";
  const value = row[field];
  return typeof value === "string" ? value : "";
}

function resolveLayerDisplayText(layer: EditableLayer, schedule: SchedulePreview): string {
  if (layer.type !== "text") return "";
  if (layer.content?.textMode === "data") {
    return resolveBindingText(schedule, layer.dataBinding);
  }
  if (layer.content?.textMode === "expression" && layer.content.expression) {
    const tokens = parseExpressionToTokens(layer.content.expression);
    return resolveExpressionText(tokens, (binding) => resolveBindingText(schedule, binding));
  }
  return layer.content?.text ?? "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function DataTreePicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (binding: string) => void;
}) {
  function renderNode(node: GraphicDataNode, depth: number) {
    if (node.kind === "leaf") {
      const selected =
        value === node.binding || value === node.path || normalizeDataBindingPath(value) === node.binding;
      return (
        <button
          key={node.id}
          type="button"
          className={`block w-full rounded px-2 py-1 text-left text-[11px] ${
            selected ? "bg-sky-900/60 text-sky-100" : "hover:bg-neutral-800"
          }`}
          style={{ paddingLeft: 8 + depth * 10 }}
          onClick={() => onChange(node.binding)}
        >
          {node.label}
        </button>
      );
    }
    return (
      <div key={node.id}>
        <div
          className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500"
          style={{ paddingLeft: 8 + depth * 10 }}
        >
          {node.label}
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-auto rounded border border-neutral-800 bg-neutral-950/80">
      {GRAPHIC_DATA_NAMESPACES.map((ns) => (
        <div key={ns.id} className="border-b border-neutral-900 last:border-0">
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            <span>{ns.label}</span>
            {ns.status === "reserved" ? (
              <span className="text-neutral-600">Coming later</span>
            ) : null}
          </div>
          {ns.status === "ready" ? renderNode(ns.root, 0) : null}
        </div>
      ))}
    </div>
  );
}

export function GraphicEditorClient({
  projectId,
  displayId,
  projectSlug,
}: GraphicEditorClientProps) {
  const [schema, setSchema] = useState<EditableGraphicSchema | null>(null);
  const [history, setHistory] = useState<EditorHistoryFrame[]>([]);
  const [future, setFuture] = useState<EditorHistoryFrame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState<
    "properties" | "data" | "animations" | "design"
  >("properties");
  const [leftPanel, setLeftPanel] = useState<"layers" | "history" | "assets" | "drafts">(
    "layers",
  );
  const [brandKit, setBrandKit] = useState<ProjectBrandKit>(() =>
    mergeBrandKit("", SAMPLE_SEMA_BRAND_KIT),
  );
  const [namedDrafts, setNamedDrafts] = useState<NamedEditorDraft[]>([]);
  const [savedBaselineSchema, setSavedBaselineSchema] = useState<EditableGraphicSchema | null>(
    null,
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeMeasurements, setActiveMeasurements] = useState<SpacingMeasurement[]>([]);
  const [showRulers, setShowRulers] = useState(true);
  const [displayName, setDisplayName] = useState("Graphic");
  const [dirty, setDirty] = useState(false);
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"dirty" | "saved" | "published">("saved");
  const [pixelPerfect, setPixelPerfect] = useState(false);
  const [showDataBindings, setShowDataBindings] = useState(true);
  const [isolationStack, setIsolationStack] = useState<string[]>([]);
  const [propSections, setPropSections] = useState<Record<string, boolean>>({
    transform: true,
    typography: true,
    appearance: true,
    effects: false,
    layout: false,
    advanced: false,
  });
  const [sampleScenarios, setSampleScenarios] = useState<SampleScenario[]>([
    {
      id: "normal",
      name: "Normal",
      schedule: LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE,
    },
    {
      id: "long-text",
      name: "Long Text",
      schedule: {
        now: { title: "A".repeat(80), description: "Long description ".repeat(8) },
      },
    },
    {
      id: "empty",
      name: "Empty Fields",
      schedule: { now: { title: "", description: "" }, next: null, later: null },
    },
  ]);
  const [activeScenarioId, setActiveScenarioId] = useState("normal");
  const [recoverOffer, setRecoverOffer] = useState<{ savedAt: string } | null>(null);
  const autosaveRef = useRef<ReturnType<typeof createAutosaveWriter> | null>(null);
  const [activeDragLayerId, setActiveDragLayerId] = useState<string | null>(null);
  const layerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [dataMode, setDataMode] = useState<"sample" | "live">("sample");
  const [liveSchedule, setLiveSchedule] = useState<SchedulePreview | null>(null);
  const [view, setView] = useState<EditorViewTransform>(() => createViewTransform({ zoom: 0.25 }));
  const [spacePan, setSpacePan] = useState(false);
  const [panning, setPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; layerId: string } | null>(
    null,
  );
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saveAsDescription, setSaveAsDescription] = useState("");
  const [schedule, setSchedule] = useState<SchedulePreview>(LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoomMode, setZoomMode] = useState<"fit" | "preset">("fit");
  const [fitScale, setFitScale] = useState(0.22);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<EditorCanvasTool>("select");
  const [shapeDraw, setShapeDraw] = useState<ShapeDrawState | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandleId | null>(null);
  const [activeGuides, setActiveGuides] = useState<SmartGuide[]>([]);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const neudgraphicInputRef = useRef<HTMLInputElement | null>(null);
  const [, setAssetUrlRevision] = useState(0);
  const guideDragRef = useRef<{
    guideId: string;
    orientation: EditableGuide["orientation"];
  } | null>(null);
  const guideSessionActiveRef = useRef(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    layer: EditableLayer;
  } | null>(null);

  const canvasScale = zoomMode === "fit" ? fitScale : view.zoom;
  const selected = schema?.layers.find((layer) => layer.id === selectedId) ?? null;
  const multiSelected = useMemo(() => {
    if (!schema) return [];
    const ids = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];
    return schema.layers.filter((layer) => ids.includes(layer.id));
  }, [schema, selectedId, selectedIds]);
  const orderedLayers = useMemo(() => {
    if (!schema) return [];
    return [...schema.layers].sort((a, b) => a.zIndex - b.zIndex);
  }, [schema]);
  /** Top of list = visually on top (highest zIndex). */
  const layerListIds = useMemo(
    () => [...orderedLayers].reverse().map((layer) => layer.id),
    [orderedLayers],
  );
  const previewSchedule =
    dataMode === "live" && liveSchedule ? liveSchedule : schedule;
  const usedAssetIds = useMemo(() => {
    if (!schema) return new Set<string>();
    const ids = new Set<string>();
    for (const layer of schema.layers) {
      if (layer.assetId) ids.add(layer.assetId);
      if (layer.content?.src) ids.add(layer.content.src);
    }
    return ids;
  }, [schema]);
  const isolationGroupId = isolationStack[isolationStack.length - 1] ?? null;

  function clearSelection() {
    setSelectedId(null);
    setSelectedIds([]);
  }

  function isLayerInIsolationContext(layer: EditableLayer): boolean {
    if (!isolationGroupId) return true;
    if (layer.id === isolationGroupId) return true;
    let parentId = layer.parentId;
    while (parentId) {
      if (parentId === isolationGroupId) return true;
      parentId = schema?.layers.find((entry) => entry.id === parentId)?.parentId ?? null;
    }
    return false;
  }

  function canvasPointFromClient(clientX: number, clientY: number) {
    const stage = canvasHostRef.current?.querySelector("[data-editor-stage]") as HTMLElement | null;
    const bounds = stage?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return clientToCanvasPoint(clientX, clientY, bounds, canvasScale);
  }

  function selectLayer(layerId: string, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    const additive = Boolean(event?.metaKey || event?.ctrlKey);
    const range = Boolean(event?.shiftKey);
    if (additive) {
      setSelectedIds((current) => {
        const next = current.includes(layerId)
          ? current.filter((id) => id !== layerId)
          : [...current, layerId];
        setSelectedId(next[next.length - 1] ?? null);
        return next;
      });
      return;
    }
    if (range && selectedId && schema) {
      const order = [...schema.layers].sort((a, b) => b.zIndex - a.zIndex).map((l) => l.id);
      const a = order.indexOf(selectedId);
      const b = order.indexOf(layerId);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const ids = order.slice(lo, hi + 1);
        setSelectedIds(ids);
        setSelectedId(layerId);
        return;
      }
    }
    setSelectedId(layerId);
    setSelectedIds([layerId]);
  }

  function applyAlign(mode: Parameters<typeof alignLayers>[1]) {
    if (!schema || multiSelected.length < 2) return;
    const aligned = alignLayers(
      multiSelected.map((l) => ({
        id: l.id,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
      })),
      mode,
    );
    const byId = new Map(aligned.map((l) => [l.id, l]));
    const next = cloneSchema(schema);
    next.layers = next.layers.map((layer) => {
      const hit = byId.get(layer.id);
      return hit ? { ...layer, x: hit.x, y: hit.y } : layer;
    });
    commitSchema(next);
  }

  function applyDistribute(mode: Parameters<typeof distributeLayers>[1]) {
    if (!schema || multiSelected.length < 3) return;
    const distributed = distributeLayers(
      multiSelected.map((l) => ({
        id: l.id,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
      })),
      mode,
    );
    const byId = new Map(distributed.map((l) => [l.id, l]));
    const next = cloneSchema(schema);
    next.layers = next.layers.map((layer) => {
      const hit = byId.get(layer.id);
      return hit ? { ...layer, x: hit.x, y: hit.y } : layer;
    });
    commitSchema(next);
  }

  async function saveAsNewDisplay() {
    if (!schema || !saveAsName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const duplicated = await localDuplicateDeveloperDisplay(projectSlug, displayId, {
        name: saveAsName.trim(),
        description: saveAsDescription.trim() || undefined,
      });
      const duplicatePayload = buildSchemaForSave();
      if (!duplicatePayload) return;
      await localSaveEditableGraphicSchema(
        projectSlug,
        duplicated.display.id,
        duplicatePayload,
      );
      setSaveAsOpen(false);
      setStatus(`Saved as “${duplicated.display.name}” (draft — not published).`);
      const desktop = getDesktopAPI();
      if (desktop?.editor?.open) {
        void desktop.editor.open({
          projectId,
          displayId: duplicated.display.id,
          projectSlug,
          title: duplicated.display.name,
        });
      }
    } catch (saveAsError) {
      setError(saveAsError instanceof Error ? saveAsError.message : "Save As failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void primeDisplayAssetUrlBase().then(() => {
      setAssetUrlRevision((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    const api = getDesktopAPI()?.app;
    if (!api?.getPlatform) return;
    void api.getPlatform().then((platform) => {
      setDesktopPlatform(platform ?? "win32");
    });
  }, []);

  useEffect(() => {
    getDesktopAPI()?.editor?.dirtyStateChanged?.({ dirty });
  }, [dirty]);

  useEffect(() => {
    const desktop = getDesktopAPI();
    const unsubscribe = desktop?.editor?.onMenuAction?.((payload) => {
      switch (payload.action) {
        case "save":
          void save();
          break;
        case "saveAs":
          setSaveAsOpen(true);
          break;
        case "importImage":
          void importImageFromPicker();
          break;
        case "importNeudGraphic":
          neudgraphicInputRef.current?.click();
          break;
        case "exportNeudGraphic":
          exportNeudGraphicPackage();
          break;
        default:
          break;
      }
    });
    return () => {
      unsubscribe?.();
    };
    // Menu wiring calls stable editor actions for this display session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, displayId, projectSlug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const { result } = await localGetEditableGraphicSchema(projectSlug, displayId);
        if (cancelled) return;
        const loaded = result.editableGraphicSchema;
        setSchema(loaded);
        setSavedBaselineSchema(cloneSchema(loaded));
        setBrandKit(
          mergeBrandKit(projectId, loaded.brandKit ?? { ...SAMPLE_SEMA_BRAND_KIT, projectId }),
        );
        setNamedDrafts(listNamedDrafts(projectId, displayId));
        setShowRulers(loaded.overlays?.rulers !== false);
        const name = result.name || "Graphic";
        setDisplayName(name);
        document.title = name;
        const firstId = result.editableGraphicSchema.layers[0]?.id ?? null;
        setSelectedId(firstId);
        setSelectedIds(firstId ? [firstId] : []);
        setSaveAsName(`${name} Copy`);
        try {
          const data = await localFetch<{
            schedule?: SchedulePreview;
            snapshot?: { schedule?: SchedulePreview };
          }>(
            `/api/display/${encodeURIComponent(projectId)}/schedule-ticker-editable/data?preview=1`,
          );
          const live = data.schedule ?? data.snapshot?.schedule;
          if (live && (live.now || live.next || live.later)) {
            setLiveSchedule(live);
            setSchedule(live);
          }
        } catch {
          // Keep local sample — never mutate canonical SEMA state.
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load editor.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [displayId, projectId, projectSlug]);

  useEffect(() => {
    function measure() {
      const host = canvasHostRef.current;
      if (!host || !schema) return;
      const next = fitZoomToViewport({
        canvasWidth: schema.width,
        canvasHeight: schema.height,
        viewportWidth: host.clientWidth,
        viewportHeight: host.clientHeight,
      });
      setFitScale(next);
      if (zoomMode === "fit") {
        setView((current) => ({ ...current, zoom: next, panX: 0, panY: 0 }));
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [schema, zoomMode]);

  // Sample vs Live — sample never writes production canonical state.
  useEffect(() => {
    if (dataMode === "live" && liveSchedule) {
      setSchedule(liveSchedule);
    } else if (dataMode === "sample") {
      setSchedule(LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE);
    }
  }, [dataMode, liveSchedule]);

  function pushHistory(next: EditableGraphicSchema, label?: string) {
    if (!schema) return;
    setHistory((current) => [
      ...current.slice(-39),
      createHistoryFrame(schema, label ?? inferHistoryLabel(schema, next)),
    ]);
    setFuture([]);
    setSchema(next);
    setDirty(true);
    setDraftStatus("dirty");
    autosaveRef.current?.schedule(next);
  }

  useEffect(() => {
    autosaveRef.current = createAutosaveWriter(projectId, displayId, 900);
    const existing = readAutosaveSnapshot(projectId, displayId);
    if (existing?.savedAt) {
      setRecoverOffer({ savedAt: existing.savedAt });
    }
    return () => {
      autosaveRef.current?.flush();
      autosaveRef.current?.cancel();
    };
  }, [projectId, displayId]);

  useEffect(() => {
    if (!schema) return;
    const snapshotUpdated = getDesktopAPI()?.editor?.snapshotUpdated;
    if (!snapshotUpdated) return;
    const timeout = window.setTimeout(() => {
      const payload = buildSchemaForSave();
      if (payload) {
        snapshotUpdated({ editableGraphicSchema: payload });
      }
    }, 400);
    return () => window.clearTimeout(timeout);
    // Debounced main-process snapshot for close-save; buildSchemaForSave follows editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, brandKit, showRulers]);

  function commitSchema(next: EditableGraphicSchema, label?: string) {
    pushHistory({ ...next, brandKit }, label);
  }

  function updateSelected(patch: Partial<EditableLayer>) {
    if (!schema || !selected) return;
    const next = cloneSchema(schema);
    next.layers = next.layers.map((layer) =>
      layer.id === selected.id
        ? {
            ...layer,
            ...patch,
            style: { ...layer.style, ...patch.style },
            content: { ...layer.content, ...patch.content },
            overflow: { ...layer.overflow, ...patch.overflow },
            animations: { ...layer.animations, ...patch.animations },
          }
        : layer,
    );
    pushHistory(next);
  }

  function undo() {
    if (!schema || history.length === 0) return;
    const previous = history[history.length - 1]!;
    setFuture((current) => [createHistoryFrame(schema, "Current"), ...current]);
    setHistory((current) => current.slice(0, -1));
    setSchema(cloneSchema(previous.schema));
    if (previous.schema.brandKit) {
      setBrandKit(mergeBrandKit(projectId, previous.schema.brandKit));
    }
  }

  function redo() {
    if (!schema || future.length === 0) return;
    const next = future[0]!;
    setHistory((current) => [
      ...current,
      createHistoryFrame(schema, inferHistoryLabel(schema, next.schema)),
    ]);
    setFuture((current) => current.slice(1));
    setSchema(cloneSchema(next.schema));
    if (next.schema.brandKit) {
      setBrandKit(mergeBrandKit(projectId, next.schema.brandKit));
    }
  }

  function jumpHistoryBack(steps: number) {
    for (let i = 0; i < steps; i++) undo();
  }

  function jumpHistoryForward(steps: number) {
    for (let i = 0; i < steps; i++) redo();
  }

  function buildSchemaForSave(): EditableGraphicSchema | null {
    if (!schema) return null;
    return {
      ...cloneSchema(schema),
      brandKit,
      overlays: { ...schema.overlays, rulers: showRulers },
    };
  }

  async function save(): Promise<boolean> {
    const payload = buildSchemaForSave();
    if (!payload) return false;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      console.info("[neud-editor-save] GraphicEditorClient.save", {
        projectSlug,
        displayId,
        layerCount: payload.layers.length,
      });
      const result = await localSaveEditableGraphicSchema(projectSlug, displayId, payload);
      const saved = result.result.editableGraphicSchema;
      setSchema(saved);
      if (saved.brandKit) {
        setBrandKit(mergeBrandKit(projectId, saved.brandKit));
      }
      setSavedBaselineSchema(cloneSchema(saved));
      setDirty(false);
      setDraftStatus("saved");
      clearAutosaveSnapshot(projectId, displayId);
      setStatus("Draft saved (not published).");
      return true;
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Unable to save draft.";
      setError(message);
      setStatus(null);
      setDirty(true);
      setDraftStatus("dirty");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function exportNeudGraphicPackage() {
    if (!schema) return;
    const pkg = buildNeudGraphicPackage({
      displayName,
      schema: { ...schema, brandKit },
      sampleScenarios,
      brandKit,
    });
    const blob = new Blob([serializeNeudGraphicPackage(pkg)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${displayName.replace(/\s+/g, "-").toLowerCase() || "graphic"}.neudgraphic`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Exported .neudgraphic package (editor draft — not published).");
  }

  function closeEditorWindow() {
    const requestClose = getDesktopAPI()?.editor?.requestClose;
    if (requestClose) {
      void requestClose();
      return;
    }
    window.close();
  }

  function addLayer(type: EditableLayerType) {
    if (!schema) return;
    const next = cloneSchema(schema);
    const maxZ = next.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
    const layer = createEmptyLayer(type, {
      zIndex: maxZ + 1,
      x: Math.round(schema.width / 2 - 160),
      y: Math.round(schema.height / 2 - 40),
    });
    next.layers.push(layer);
    pushHistory(next);
    setSelectedId(layer.id);
  }

  function duplicateLayer(layerId: string) {
    if (!schema) return;
    const source = schema.layers.find((layer) => layer.id === layerId);
    if (!source) return;
    const next = cloneSchema(schema);
    const maxZ = next.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
    const copy: EditableLayer = {
      ...JSON.parse(JSON.stringify(source)) as EditableLayer,
      id: createLayerId("copy"),
      name: `${source.name} Copy`,
      x: source.x + 24,
      y: source.y + 24,
      zIndex: maxZ + 1,
      locked: false,
    };
    next.layers.push(copy);
    pushHistory(next);
    setSelectedId(copy.id);
  }

  function duplicateSelected() {
    if (!selected) return;
    duplicateLayer(selected.id);
  }

  function deleteLayer(layerId: string) {
    if (!schema) return;
    const source = schema.layers.find((layer) => layer.id === layerId);
    if (!source || source.locked) return;
    const next = cloneSchema(schema);
    next.layers = next.layers
      .filter((layer) => layer.id !== layerId)
      .map((layer) =>
        layer.parentId === layerId ? { ...layer, parentId: null } : layer,
      );
    pushHistory(next);
    setSelectedId(next.layers[0]?.id ?? null);
  }

  function deleteSelected() {
    if (!selected) return;
    deleteLayer(selected.id);
  }

  function groupSelectedWithSiblings() {
    if (!schema || !selected) return;
    // Simple group: create a group layer and parent the selection into it.
    const next = cloneSchema(schema);
    const maxZ = next.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
    const group = createEmptyLayer("group", {
      id: createLayerId("group"),
      name: "Group",
      x: selected.x,
      y: selected.y,
      width: selected.width,
      height: selected.height,
      zIndex: maxZ + 1,
    });
    next.layers = next.layers.map((layer) =>
      layer.id === selected.id
        ? { ...layer, parentId: group.id, x: 0, y: 0 }
        : layer,
    );
    next.layers.push(group);
    pushHistory(next);
    setSelectedId(group.id);
    setStatus("Grouped selected layer (basic parent/child).");
  }

  function moveLayerOrder(fromId: string, toId: string) {
    if (!schema || fromId === toId) return;
    const next = cloneSchema(schema);
    const sorted = [...next.layers].sort((a, b) => a.zIndex - b.zIndex);
    const fromIndex = sorted.findIndex((layer) => layer.id === fromId);
    const toIndex = sorted.findIndex((layer) => layer.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = sorted.splice(fromIndex, 1);
    if (!moved) return;
    sorted.splice(toIndex, 0, moved);
    next.layers = sorted.map((layer, index) => ({ ...layer, zIndex: index }));
    pushHistory(next);
  }

  function bringLayer(layerId: string, delta: number) {
    if (!schema) return;
    const next = cloneSchema(schema);
    const sorted = [...next.layers].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex((layer) => layer.id === layerId);
    if (index < 0) return;
    let target = index + delta;
    if (delta >= 999) target = sorted.length - 1;
    if (delta <= -999) target = 0;
    target = Math.max(0, Math.min(sorted.length - 1, target));
    if (target === index) return;
    const [moved] = sorted.splice(index, 1);
    if (!moved) return;
    sorted.splice(target, 0, moved);
    next.layers = sorted.map((layer, i) => ({ ...layer, zIndex: i }));
    pushHistory(next);
  }

  function layerGuideRects(excludeId: string) {
    if (!schema) return [];
    return schema.layers
      .filter((layer) => layer.id !== excludeId && layer.visible !== false)
      .map((layer) => ({
        id: layer.id,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      }));
  }

  function beginTransform(
    event: ReactPointerEvent,
    mode: DragMode,
    handle?: ResizeHandleId,
  ) {
    if (activeTool !== "select" || !schema || !selected || selected.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setDragMode(mode);
    setResizeHandle(handle ?? null);
    setHistory((current) => [
      ...current.slice(-39),
      createHistoryFrame(
        { ...schema, brandKit },
        mode === "move"
          ? `Move ${selected.name}`
          : mode === "resize"
            ? `Resize ${selected.name}`
            : `Rotate ${selected.name}`,
      ),
    ]);
    setFuture([]);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      layer: { ...selected, style: { ...selected.style }, content: { ...selected.content } },
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (guideDragRef.current) {
      moveCanvasGuideDrag(event.clientX, event.clientY);
      return;
    }
    if (shapeDraw) {
      const point = canvasPointFromClient(event.clientX, event.clientY);
      setShapeDraw((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
            }
          : null,
      );
      return;
    }
    if (!dragMode || !schema || !selectedId || !dragStartRef.current) return;
    const start = dragStartRef.current;
    const dx = (event.clientX - start.x) / canvasScale;
    const dy = (event.clientY - start.y) / canvasScale;
    const next = cloneSchema(schema);
    const others = layerGuideRects(selectedId);
    const canvas = { width: schema.width, height: schema.height };
    const snapOpts = { enabled: snapEnabled, threshold: SNAP_THRESHOLD };

    next.layers = next.layers.map((layer) => {
      if (layer.id !== selectedId) return layer;
      if (dragMode === "move") {
        const snapped = snapMove(
          {
            id: layer.id,
            x: Math.round(start.layer.x + dx),
            y: Math.round(start.layer.y + dy),
            width: layer.width,
            height: layer.height,
          },
          { x: Math.round(start.layer.x + dx), y: Math.round(start.layer.y + dy) },
          canvas,
          others,
          snapOpts,
        );
        setActiveGuides(snapped.guides);
        setActiveMeasurements(snapped.measurements ?? []);
        return { ...layer, x: snapped.x, y: snapped.y };
      }
      if (dragMode === "resize" && resizeHandle) {
        let { x, y, width, height } = start.layer;
        if (resizeHandle.includes("e")) width = Math.max(8, start.layer.width + dx);
        if (resizeHandle.includes("s")) height = Math.max(8, start.layer.height + dy);
        if (resizeHandle.includes("w")) {
          width = Math.max(8, start.layer.width - dx);
          x = start.layer.x + (start.layer.width - width);
        }
        if (resizeHandle.includes("n")) {
          height = Math.max(8, start.layer.height - dy);
          y = start.layer.y + (start.layer.height - height);
        }
        const snapped = snapResize(
          {
            id: layer.id,
            x: start.layer.x,
            y: start.layer.y,
            width: start.layer.width,
            height: start.layer.height,
          },
          {
            id: layer.id,
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          },
          canvas,
          others,
          snapOpts,
        );
        setActiveGuides(snapped.guides);
        setActiveMeasurements(snapped.measurements ?? []);
        return {
          ...layer,
          x: snapped.x,
          y: snapped.y,
          width: snapped.width,
          height: snapped.height,
        };
      }
      if (dragMode === "rotate") {
        const cx = start.layer.x + start.layer.width / 2;
        const cy = start.layer.y + start.layer.height / 2;
        const rect = canvasHostRef.current?.querySelector("[data-editor-stage]") as HTMLElement | null;
        const bounds = rect?.getBoundingClientRect();
        if (!bounds) return layer;
        const px = (event.clientX - bounds.left) / canvasScale;
        const py = (event.clientY - bounds.top) / canvasScale;
        const angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
        return { ...layer, rotation: Math.round(angle) };
      }
      return layer;
    });
    setSchema(next);
  }

  function cancelShapeDraw() {
    setShapeDraw(null);
  }

  function finishShapeDraw(state: ShapeDrawState) {
    if (!schema) {
      cancelShapeDraw();
      return;
    }
    const bounds = computeShapeDrawBounds(
      state.startX,
      state.startY,
      state.currentX,
      state.currentY,
      { constrainSquare: state.shiftKey, fromCenter: state.altKey },
    );
    cancelShapeDraw();
    if (!isShapeDrawLargeEnough(bounds)) {
      setActiveTool("select");
      return;
    }
    const next = cloneSchema(schema);
    const maxZ = next.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
    const layer = createEmptyLayer(state.tool, {
      zIndex: maxZ + 1,
      x: bounds.x,
      y: bounds.y,
      width: Math.max(8, bounds.width),
      height: Math.max(8, bounds.height),
    });
    next.layers.push(layer);
    pushHistory(next);
    setSelectedId(layer.id);
    setSelectedIds([layer.id]);
    setActiveTool("select");
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = canvasPointFromClient(event.clientX, event.clientY);
    if (activeTool === "rect" || activeTool === "ellipse") {
      event.preventDefault();
      setShapeDraw({
        tool: activeTool,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
    if (activeTool !== "select") return;
    if (event.target !== event.currentTarget) return;
    clearSelection();
  }

  function onStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!shapeDraw) return;
    event.stopPropagation();
    finishShapeDraw(shapeDraw);
  }

  function onCanvasPointerUp(event?: ReactPointerEvent<HTMLElement>) {
    if (guideDragRef.current) {
      endCanvasGuideDrag(event);
      return;
    }
    if (shapeDraw) return;
    if (dragMode && schema) {
      setDirty(true);
      setDraftStatus("dirty");
      autosaveRef.current?.schedule({ ...schema, brandKit });
    }
    setDragMode(null);
    setResizeHandle(null);
    setActiveGuides([]);
    setActiveMeasurements([]);
    dragStartRef.current = null;
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;

      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (meta && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (meta && event.key.toLowerCase() === "g" && !event.shiftKey) {
        event.preventDefault();
        groupSelectedWithSiblings();
        return;
      }
      if (meta && event.key.toLowerCase() === "s" && !event.shiftKey) {
        event.preventDefault();
        void save();
        return;
      }
      if (meta && event.key.toLowerCase() === "s" && event.shiftKey) {
        event.preventDefault();
        setSaveAsOpen(true);
        return;
      }
      if (meta && event.key.toLowerCase() === "g" && event.shiftKey) {
        event.preventDefault();
        if (selected?.parentId) {
          updateSelected({ parentId: null });
        }
        return;
      }
      if (meta && event.key.toLowerCase() === "c") {
        event.preventDefault();
        if (selected) {
          try {
            void navigator.clipboard.writeText(
              JSON.stringify({ neudEditorLayers: [selected], schemaVersion: 2 }),
            );
            setStatus("Copied layer schema");
          } catch {
            setStatus("Clipboard copy unavailable");
          }
        }
        return;
      }
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void (async () => {
          try {
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text) as { neudEditorLayers?: EditableLayer[] };
            if (!schema || !Array.isArray(parsed.neudEditorLayers)) return;
            const next = cloneSchema(schema);
            const maxZ = next.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
            for (const [index, layer] of parsed.neudEditorLayers.entries()) {
              next.layers.push({
                ...layer,
                id: createLayerId("paste"),
                name: `${layer.name} Copy`,
                x: layer.x + 24,
                y: layer.y + 24,
                zIndex: maxZ + 1 + index,
              });
            }
            pushHistory(next);
            setStatus("Pasted layer schema");
          } catch {
            // ignore invalid clipboard
          }
        })();
        return;
      }
      if (event.key === "Escape") {
        if (shapeDraw) {
          event.preventDefault();
          cancelShapeDraw();
          setActiveTool("select");
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!schema || !selected || selected.locked) return;
      const step = event.shiftKey ? 10 : 1;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        updateSelected({ x: selected.x + dx, y: selected.y + dy });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, selected, history, future]);

  async function applyImportedImageAsset(input: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
  }) {
    if (!schema) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await localImportDisplayAsset(projectSlug, displayId, input);
      const next = cloneSchema(schema);
      const maxZ = next.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
      const layer = createEmptyLayer("image", {
        zIndex: maxZ + 1,
        name: input.fileName,
        assetId: imported.result.relativePath,
        content: { src: imported.result.relativePath },
        style: { objectFit: "contain" },
        x: Math.round(schema.width / 2 - 200),
        y: Math.round(schema.height / 2 - 150),
        width: 400,
        height: 300,
      });
      next.layers.push(layer);
      const kind = assetKindFromFilename(input.fileName);
      if (kind) {
        next.projectAssets = upsertProjectAsset(next.projectAssets ?? [], {
          id: createProjectAssetId(input.fileName),
          name: input.fileName,
          kind,
          category: assetCategoryFromFilename(input.fileName),
          relativePath: imported.result.relativePath,
          mimeType: input.mimeType || "image/png",
          createdAt: new Date().toISOString(),
        });
      }
      pushHistory(next, "Import Image");
      setSelectedId(layer.id);
      setSelectedIds([layer.id]);
      setLeftPanel("layers");
      setAssetUrlRevision((value) => value + 1);
      setStatus(`Imported image → ${imported.result.relativePath}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Image import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onImportImage(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToBase64(file);
    await applyImportedImageAsset({
      fileName: file.name,
      mimeType: file.type || "image/png",
      dataBase64: dataUrl,
    });
  }

  async function importImageFromPicker() {
    const desktop = getDesktopAPI();
    if (desktop?.editor?.pickImageFile) {
      try {
        const picked = await desktop.editor.pickImageFile();
        if (picked.canceled) return;
        await applyImportedImageAsset({
          fileName: picked.fileName,
          mimeType: picked.mimeType,
          dataBase64: picked.dataBase64,
        });
      } catch (pickError) {
        setError(pickError instanceof Error ? pickError.message : "Image import failed.");
      }
      return;
    }
    imageInputRef.current?.click();
  }

  async function registerAssetFromUpload(
    file: File,
    category: ProjectAssetCategory,
    relativePath: string,
  ): Promise<ProjectAsset | null> {
    if (!schema) return null;
    const kind = assetKindFromFilename(file.name);
    if (!kind) return null;
    const asset: ProjectAsset = {
      id: createProjectAssetId(file.name),
      name: file.name,
      kind,
      category,
      relativePath,
      mimeType: file.type || "image/png",
      createdAt: new Date().toISOString(),
    };
    const next = cloneSchema(schema);
    next.projectAssets = upsertProjectAsset(next.projectAssets ?? [], asset);
    pushHistory(next, `Upload Asset ${asset.name}`);
    return asset;
  }

  async function uploadLibraryAsset(file: File, category: ProjectAssetCategory) {
    if (!schema) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToBase64(file);
      const imported = await localImportDisplayAsset(projectSlug, displayId, {
        fileName: file.name,
        mimeType: file.type || "image/png",
        dataBase64: dataUrl,
      });
      await registerAssetFromUpload(
        file,
        category || assetCategoryFromFilename(file.name),
        imported.result.relativePath,
      );
      setStatus(`Uploaded ${file.name} to asset library.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Asset upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function chooseExistingAsset(asset: ProjectAsset) {
    if (!schema || !selected) {
      setStatus("Select an image layer to assign an asset.");
      return;
    }
    if (selected.type !== "image") {
      setStatus("Choose Existing applies to image layers.");
      return;
    }
    const next = cloneSchema(schema);
    next.layers = next.layers.map((layer) =>
      layer.id === selected.id
        ? {
            ...layer,
            assetId: asset.relativePath,
            content: { ...layer.content, src: asset.relativePath },
          }
        : layer,
    );
    pushHistory(next, `Choose Asset ${asset.name}`);
  }

  function beginGuideEditSession(label = "Move Guide") {
    if (!schema || guideSessionActiveRef.current) return;
    guideSessionActiveRef.current = true;
    setHistory((current) => [
      ...current.slice(-39),
      createHistoryFrame({ ...schema, brandKit }, label),
    ]);
    setFuture([]);
  }

  function previewDocumentGuides(guides: EditableGuide[]) {
    if (!schema) return;
    setSchema({ ...schema, guides, brandKit });
  }

  function endGuideEditSession(guides: EditableGuide[]) {
    if (!schema) return;
    const next = { ...schema, guides, brandKit };
    setSchema(next);
    guideSessionActiveRef.current = false;
    setDirty(true);
    setDraftStatus("dirty");
    autosaveRef.current?.schedule(next);
  }

  function commitDocumentGuides(guides: EditableGuide[], label = "Edit Guides") {
    if (!schema) return;
    pushHistory({ ...schema, guides, brandKit }, label);
  }

  function canvasGuidePositionFromClient(clientX: number, clientY: number): number | null {
    const stage = canvasHostRef.current?.querySelector("[data-editor-stage]") as HTMLElement | null;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const drag = guideDragRef.current;
    if (!drag) return null;
    return drag.orientation === "vertical"
      ? (clientX - rect.left) / canvasScale
      : (clientY - rect.top) / canvasScale;
  }

  function beginCanvasGuideDrag(event: ReactPointerEvent, guide: EditableGuide) {
    event.preventDefault();
    event.stopPropagation();
    beginGuideEditSession("Move Guide");
    guideDragRef.current = { guideId: guide.id, orientation: guide.orientation };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveCanvasGuideDrag(clientX: number, clientY: number) {
    const drag = guideDragRef.current;
    if (!drag) return;
    const position = canvasGuidePositionFromClient(clientX, clientY);
    if (position == null) return;
    setSchema((current) => {
      if (!current) return current;
      return {
        ...current,
        brandKit,
        guides: updateGuidePosition(current.guides ?? [], drag.guideId, position),
      };
    });
  }

  function endCanvasGuideDrag(event?: ReactPointerEvent) {
    const drag = guideDragRef.current;
    if (!drag || !schema) return;
    guideDragRef.current = null;
    let guides = schema.guides ?? [];
    const guide = guides.find((entry) => entry.id === drag.guideId);
    if (guide && isGuideOffCanvas(guide, schema.width, schema.height)) {
      guides = removeGuide(guides, drag.guideId);
    }
    endGuideEditSession(guides);
    event?.currentTarget instanceof HTMLElement &&
      event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  async function onImportNeudGraphic(file: File | null) {
    if (!file || !schema) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const pkg = parseNeudGraphicPackage(parsed);
      if (pkg.manifest.width <= 0 || pkg.manifest.height <= 0) {
        throw new Error("Invalid .neudgraphic: manifest dimensions must be positive.");
      }
      const imported = cloneSchema(pkg.schema);
      imported.brandKit = pkg.brandKit ?? imported.brandKit ?? null;
      if (pkg.brandKit) {
        setBrandKit(mergeBrandKit(projectId, pkg.brandKit));
      }
      if (Object.keys(pkg.sampleData).length > 0) {
        const scenarios = Object.entries(pkg.sampleData).map(([id, schedule]) => ({
          id,
          name: id,
          schedule,
        }));
        setSampleScenarios((current) => [...current, ...scenarios]);
      }
      pushHistory(imported, `Import ${pkg.manifest.displayName}`);
      setDisplayName(pkg.manifest.displayName);
      setStatus("Imported .neudgraphic into editor (not published).");
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Invalid .neudgraphic package.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !schema) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-red-300">
        {error}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-300">
        Loading graphic editor…
      </div>
    );
  }

  const stageStyle: CSSProperties = {
    width: schema.width * canvasScale,
    height: schema.height * canvasScale,
    backgroundImage:
      "linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)",
    backgroundSize: "24px 24px",
    backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
    backgroundColor: schema.background?.color === "transparent" ? undefined : schema.background?.color,
  };

  const iconBtn = (
    label: string,
    onClick: () => void,
    opts?: { disabled?: boolean; active?: boolean; icon?: ReactNode },
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={opts?.disabled}
      className={toolbarBtn(Boolean(opts?.disabled), opts?.active)}
      onClick={onClick}
    >
      {opts?.icon ?? label}
    </button>
  );

  function onLayerDragStart(event: DragStartEvent) {
    setActiveDragLayerId(String(event.active.id));
  }

  function onLayerDragEnd(event: DragEndEvent) {
    setActiveDragLayerId(null);
    if (!schema) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layerListIds.indexOf(String(active.id));
    const newIndex = layerListIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(layerListIds, oldIndex, newIndex);
    // Top row = visually on top = highest zIndex
    const zById = new Map(nextOrder.map((id, index) => [id, nextOrder.length - 1 - index]));
    const next = cloneSchema(schema);
    next.layers = next.layers.map((layer) => ({
      ...layer,
      zIndex: zById.get(layer.id) ?? layer.zIndex,
    }));
    pushHistory(next);
  }

  const shapePreviewBounds = shapeDraw
    ? computeShapeDrawBounds(
        shapeDraw.startX,
        shapeDraw.startY,
        shapeDraw.currentX,
        shapeDraw.currentY,
        { constrainSquare: shapeDraw.shiftKey, fromCenter: shapeDraw.altKey },
      )
    : null;

  const performanceBudget = estimateGraphicBudget(schema.layers);
  const draftLabel =
    draftStatus === "dirty"
      ? "Draft — Unsaved"
      : draftStatus === "published"
        ? "Published"
        : "Draft — Saved";
  const showMacTrafficLightInset = desktopPlatform === "darwin";

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* h-9 matches AppTitleBar / desktopTitleBarCssHeight (2.25rem) */}
      <div
        className="relative flex h-9 shrink-0 items-center border-b border-[#2a3a52] bg-[#1a2332]"
        style={{ minHeight: desktopTitleBarCssHeight("win32") } as CSSProperties}
      >
        {showMacTrafficLightInset ? (
          <div
            className="w-[78px] shrink-0"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            aria-hidden
          />
        ) : null}
        <div
          className="relative flex min-w-0 flex-1 items-center"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="max-w-[50%] truncate text-xs font-semibold tracking-wide text-[#e8eef7]">
              {displayName}
            </span>
            <span className="text-[10px] text-[#8aa0bc]">
              {draftLabel} · {schema.width}×{schema.height}
              {schema.designLocked ? " · Locked" : ""}
            </span>
          </div>
        </div>
        <div
          className="relative z-10 ml-auto flex items-center gap-2 pr-3"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              performanceBudget.level === "good"
                ? "bg-emerald-950 text-emerald-300"
                : performanceBudget.level === "moderate"
                  ? "bg-amber-950 text-amber-200"
                  : "bg-red-950 text-red-300"
            }`}
            title={performanceBudget.contributors
              .map((entry) => `${entry.name}: ${entry.cost}`)
              .join("\n")}
          >
            Perf: {performanceBudget.level}
          </span>
        </div>
      </div>
      {/* Toolbar: left (over Layers) | canvas tools | view controls */}
      <header className="grid shrink-0 grid-cols-[280px_1fr_320px] border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between gap-1 border-r border-neutral-800 px-2 py-1.5">
          <div className="flex items-center gap-1">
            {iconBtn("Undo", undo, {
              disabled: history.length === 0 || busy,
              icon: <EditorUndoIcon />,
            })}
            {iconBtn("Redo", redo, {
              disabled: future.length === 0 || busy,
              icon: <EditorRedoIcon />,
            })}
          </div>
          {iconBtn("Group", () => groupSelectedWithSiblings(), { disabled: !selected || busy })}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {iconBtn("Select", () => setActiveTool("select"), {
              active: activeTool === "select",
              icon: <EditorSelectIcon />,
            })}
            {iconBtn("Text", () => addLayer("text"), { disabled: busy, icon: <EditorTextIcon /> })}
            {iconBtn("Rectangle", () => setActiveTool("rect"), {
              disabled: busy,
              active: activeTool === "rect",
              icon: <EditorRectIcon />,
            })}
            {iconBtn("Ellipse", () => setActiveTool("ellipse"), {
              disabled: busy,
              active: activeTool === "ellipse",
              icon: <EditorEllipseIcon />,
            })}
            {iconBtn("Line", () => addLayer("line"), { disabled: busy, icon: <EditorLineIcon /> })}
            {iconBtn("Image", () => void importImageFromPicker(), {
              disabled: busy,
              icon: <EditorImageIcon />,
            })}
            {multiSelected.length >= 2 ? (
              <>
                <span className="mx-1 h-5 w-px bg-neutral-800" />
                {iconBtn("Align Left", () => applyAlign("left"))}
                {iconBtn("Align H Center", () => applyAlign("hcenter"))}
                {iconBtn("Align Right", () => applyAlign("right"))}
                {iconBtn("Align Top", () => applyAlign("top"))}
                {iconBtn("Align V Center", () => applyAlign("vcenter"))}
                {iconBtn("Align Bottom", () => applyAlign("bottom"))}
              </>
            ) : null}
            {multiSelected.length >= 3 ? (
              <>
                {iconBtn("Distribute H", () => applyDistribute("horizontal"))}
                {iconBtn("Distribute V", () => applyDistribute("vertical"))}
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {iconBtn(`Snap ${snapEnabled ? "On" : "Off"}`, () => setSnapEnabled((v) => !v), {
              active: snapEnabled,
            })}
            {iconBtn("Pixel Perfect", () => setPixelPerfect((v) => !v), { active: pixelPerfect })}
            {iconBtn("Fit", () => setZoomMode("fit"), { active: zoomMode === "fit" })}
            {iconBtn("Zoom Out", () => {
              setZoomMode("preset");
              setView((current) => ({ ...current, zoom: stepZoom(canvasScale, -1) }));
            }, { icon: <EditorZoomOutIcon /> })}
            <select
              aria-label="Zoom level"
              title="Zoom level"
              className="min-w-[4.5rem] rounded border border-neutral-700 bg-neutral-900 px-1 py-1 text-center text-[11px]"
              value={zoomMode === "fit" ? "fit" : String(canvasScale)}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "fit") {
                  setZoomMode("fit");
                  return;
                }
                setZoomMode("preset");
                setView((current) => ({ ...current, zoom: clampZoom(Number(value)) }));
              }}
            >
              <option value="fit">Fit</option>
              {ZOOM_PRESETS.map((z) => (
                <option key={z} value={String(z)}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
            {iconBtn("Zoom In", () => {
              setZoomMode("preset");
              setView((current) => ({ ...current, zoom: stepZoom(canvasScale, 1) }));
            }, { icon: <EditorZoomInIcon /> })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 border-l border-neutral-800 px-2 py-1.5">
          {iconBtn(`Rulers ${showRulers ? "On" : "Off"}`, () => setShowRulers((v) => !v), {
            active: showRulers,
          })}
          {iconBtn("Compare", () => setCompareOpen(true))}
          {iconBtn(`Bindings ${showDataBindings ? "On" : "Off"}`, () =>
            setShowDataBindings((v) => !v),
          )}
        </div>
      </header>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(event) => void onImportImage(event.target.files?.[0] ?? null)}
      />
      <input
        ref={neudgraphicInputRef}
        type="file"
        accept=".neudgraphic,application/json"
        className="hidden"
        onChange={(event) => void onImportNeudGraphic(event.target.files?.[0] ?? null)}
      />

      {saveAsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
            <h2 className="text-sm font-semibold">Save As</h2>
            <p className="text-[11px] text-neutral-500">
              Create a new editor-compatible display from this graphic. Not published automatically.
            </p>
            <label className="block text-xs">
              Name
              <input
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5"
                value={saveAsName}
                onChange={(event) => setSaveAsName(event.target.value)}
              />
            </label>
            <label className="block text-xs">
              Description (optional)
              <textarea
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5"
                rows={2}
                value={saveAsDescription}
                onChange={(event) => setSaveAsDescription(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={toolbarBtn(false)} onClick={() => setSaveAsOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={toolbarBtn(busy || !saveAsName.trim())}
                disabled={busy || !saveAsName.trim()}
                onClick={() => void saveAsNewDisplay()}
              >
                Create Display
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(status || error) && (
        <div className="border-b border-neutral-800 px-4 py-2 text-xs">
          {status ? <span className="text-emerald-300">{status}</span> : null}
          {error ? <span className="text-red-300">{error}</span> : null}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_320px] bg-neutral-950">
        <aside className="flex min-h-0 flex-col border-r border-neutral-800 bg-neutral-950">
          <div className="flex shrink-0 border-b border-neutral-800 text-[10px]">
            {(
              [
                ["layers", "Layers"],
                ["history", "History"],
                ["assets", "Assets"],
                ["drafts", "Drafts"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`flex-1 px-1 py-2 ${
                  leftPanel === id
                    ? "border-b-2 border-sky-500 text-sky-200"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
                onClick={() => setLeftPanel(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {leftPanel === "history" ? (
              <EditorHistoryPanel
                history={history}
                future={future}
                onJumpBack={jumpHistoryBack}
                onJumpForward={jumpHistoryForward}
              />
            ) : null}
            {leftPanel === "assets" ? (
              <AssetLibraryPanel
                assets={schema.projectAssets ?? []}
                busy={busy}
                usedAssetIds={usedAssetIds}
                resolveThumbnailUrl={(asset) =>
                  displayAssetUrl(projectSlug, displayId, asset.relativePath)
                }
                onUpload={(file, category) => void uploadLibraryAsset(file, category)}
                onChoose={(asset) => chooseExistingAsset(asset)}
                onRename={(assetId, name) => {
                  const next = cloneSchema(schema);
                  next.projectAssets = (next.projectAssets ?? []).map((entry) =>
                    entry.id === assetId ? { ...entry, name } : entry,
                  );
                  commitSchema(next, "Rename Asset");
                }}
                onDelete={(assetId) => {
                  const next = cloneSchema(schema);
                  next.projectAssets = (next.projectAssets ?? []).filter(
                    (entry) => entry.id !== assetId,
                  );
                  commitSchema(next, "Delete Asset");
                }}
              />
            ) : null}
            {leftPanel === "drafts" ? (
              <NamedDraftsPanel
                drafts={namedDrafts}
                onSaveAsDraft={(name) => {
                  saveNamedDraft(projectId, displayId, name, { ...schema, brandKit });
                  setNamedDrafts(listNamedDrafts(projectId, displayId));
                  setStatus(`Saved named draft “${name}”.`);
                }}
                onOpen={(draftId) => {
                  const hit = namedDrafts.find((draft) => draft.id === draftId);
                  if (!hit) return;
                  pushHistory(hit.schema, `Open Draft ${hit.name}`);
                  if (hit.schema.brandKit) {
                    setBrandKit(mergeBrandKit(projectId, hit.schema.brandKit));
                  }
                }}
                onRename={(draftId, name) => {
                  setNamedDrafts(renameNamedDraft(projectId, displayId, draftId, name));
                }}
                onDuplicate={(draftId) => {
                  setNamedDrafts(duplicateNamedDraft(projectId, displayId, draftId));
                }}
                onDelete={(draftId) => {
                  setNamedDrafts(deleteNamedDraft(projectId, displayId, draftId));
                }}
              />
            ) : null}
            {leftPanel === "layers" ? (
            <DndContext
              sensors={layerSensors}
              collisionDetection={closestCenter}
              onDragStart={onLayerDragStart}
              onDragEnd={onLayerDragEnd}
            >
              <SortableContext items={layerListIds} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {layerListIds.map((layerId) => {
                    const layer = schema.layers.find((entry) => entry.id === layerId);
                    if (!layer) return null;
                    return (
                      <SortableEditorLayerRow
                        key={layer.id}
                        layer={layer}
                        selected={selectedIds.includes(layer.id) || selectedId === layer.id}
                        renaming={renamingId === layer.id}
                        onSelect={(event) => selectLayer(layer.id, event)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          selectLayer(layer.id, event);
                          setLayerMenu({ x: event.clientX, y: event.clientY, layerId: layer.id });
                        }}
                        onToggleVisible={() => {
                          const next = cloneSchema(schema);
                          next.layers = next.layers.map((entry) =>
                            entry.id === layer.id ? { ...entry, visible: !entry.visible } : entry,
                          );
                          commitSchema(next);
                        }}
                        onToggleLock={() => {
                          const next = cloneSchema(schema);
                          next.layers = next.layers.map((entry) =>
                            entry.id === layer.id ? { ...entry, locked: !entry.locked } : entry,
                          );
                          commitSchema(next);
                        }}
                        onRenameStart={() => setRenamingId(layer.id)}
                        onRenameChange={(name) => {
                          const next = cloneSchema(schema);
                          next.layers = next.layers.map((entry) =>
                            entry.id === layer.id ? { ...entry, name } : entry,
                          );
                          setSchema(next);
                        }}
                        onRenameCommit={() => {
                          setRenamingId(null);
                          pushHistory(cloneSchema(schema));
                        }}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
                {activeDragLayerId ? (
                  <div className="rounded border border-sky-500/50 bg-neutral-800 px-2 py-1.5 text-xs opacity-90 shadow-lg">
                    {schema.layers.find((layer) => layer.id === activeDragLayerId)?.name ?? "Layer"}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            ) : null}
          </div>
        </aside>

        <main
          ref={canvasHostRef}
          className="relative overflow-auto bg-neutral-900 p-4"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
        >
          <TransformHud
            visible={Boolean((selected && dragMode) || shapePreviewBounds)}
            x={shapePreviewBounds?.x ?? selected?.x ?? 0}
            y={shapePreviewBounds?.y ?? selected?.y ?? 0}
            w={shapePreviewBounds?.width ?? selected?.width ?? 0}
            h={shapePreviewBounds?.height ?? selected?.height ?? 0}
          />
          {recoverOffer ? (
            <div className="mb-2 flex items-center justify-between rounded border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
              <span>Recover unsaved draft from {recoverOffer.savedAt}?</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={toolbarBtn(false)}
                  onClick={() => {
                    const snap = readAutosaveSnapshot(projectId, displayId);
                    if (snap?.schema) {
                      setSchema(snap.schema);
                      setDirty(true);
                      setDraftStatus("dirty");
                      setStatus("Recovered autosave draft (not published).");
                    }
                    setRecoverOffer(null);
                  }}
                >
                  Recover
                </button>
                <button
                  type="button"
                  className={toolbarBtn(false)}
                  onClick={() => {
                    clearAutosaveSnapshot(projectId, displayId);
                    setRecoverOffer(null);
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          <EditorRulers
            canvasWidth={schema.width}
            canvasHeight={schema.height}
            scale={canvasScale}
            visible={showRulers}
            guides={schema.guides ?? []}
            onGuideSessionStart={() => beginGuideEditSession("Edit Guides")}
            onGuidesPreview={previewDocumentGuides}
            onGuideSessionEnd={endGuideEditSession}
          >
          <div className="relative mx-auto origin-top border border-neutral-700" style={stageStyle}>
            <div
              data-editor-stage
              className="absolute left-0 top-0"
              style={{
                width: schema.width,
                height: schema.height,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                cursor:
                  activeTool === "rect" || activeTool === "ellipse"
                    ? "crosshair"
                    : undefined,
              }}
              onPointerDown={onStagePointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onStagePointerUp}
            >
              {orderedLayers.map((layer) => {
                if (layer.visible === false) return null;
                if (!isLayerInIsolationContext(layer)) return null;
                const text =
                  layer.type === "text" ? resolveLayerDisplayText(layer, previewSchedule) : "";
                const resolvedFont =
                  layer.type === "text" && layer.style?.fontFamily
                    ? resolveFontFamily(
                        layer.style.fontFamily,
                        schema.fontFallbacks ?? {},
                        COMMON_EDITOR_FONTS,
                      )
                    : null;
                const isSelected = selectedId === layer.id;
                const imageSrc =
                  layer.type === "image" && (layer.content?.src || layer.assetId)
                    ? displayAssetUrl(
                        projectSlug,
                        displayId,
                        String(layer.content?.src || layer.assetId),
                      )
                    : "";
                const bindingLabel = layer.dataBinding
                  ? DATA_LEAVES.find(
                      (leaf) =>
                        leaf.binding === layer.dataBinding || leaf.path === layer.dataBinding,
                    )?.label || String(layer.dataBinding)
                  : null;
                return (
                  <div
                    key={layer.id}
                    data-layer-id={layer.id}
                    onDoubleClick={() => {
                      if (layer.type === "text") {
                        setRightTab("properties");
                        setStatus("Text edit mode — edit content in Properties.");
                      } else if (layer.type === "image") {
                        setRightTab("properties");
                        setStatus("Image crop mode — adjust crop in Properties.");
                      } else if (layer.type === "group" || layer.type === "component-instance") {
                        setIsolationStack((current) => [...current, layer.id]);
                        setStatus(`Isolation: ${layer.name}`);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (activeTool === "rect" || activeTool === "ellipse") return;
                      event.stopPropagation();
                      const point = canvasPointFromClient(event.clientX, event.clientY);
                      const hit = hitTestTopLayer(schema.layers, point.x, point.y, {
                        isolationGroupId,
                      });
                      if (!hit || hit.id !== layer.id) return;
                      selectLayer(hit.id, event);
                      if (hit.locked || activeTool !== "select") return;
                      beginTransform(event, "move");
                    }}
                    className="absolute"
                    style={{
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      zIndex: layer.zIndex,
                      opacity: layer.opacity ?? 1,
                      transform: `rotate(${layer.rotation || 0}deg)`,
                      transformOrigin: "center center",
                      ...(isSelected ? selectionFrameStyle(canvasScale) : {}),
                      cursor:
                        activeTool === "select" && !layer.locked
                          ? dragMode === "move"
                            ? "grabbing"
                            : "move"
                          : activeTool === "select"
                            ? "default"
                            : undefined,
                      overflow: "hidden",
                      background:
                        layer.type === "rect"
                          ? layer.style?.fill ?? "rgba(8,8,10,0.92)"
                          : layer.type === "ellipse"
                            ? layer.style?.fill ?? "rgba(61,220,132,0.35)"
                            : layer.type === "logo-placeholder"
                              ? "rgba(220,30,40,0.08)"
                              : layer.type === "group"
                                ? "rgba(56,189,248,0.06)"
                                : "transparent",
                      borderRadius: layer.type === "ellipse" ? "50%" : undefined,
                      borderTop:
                        layer.type === "rect"
                          ? `3px solid ${layer.style?.stroke || "#DC1E28"}`
                          : layer.type === "line"
                            ? `${layer.style?.strokeWidth || 4}px solid ${layer.style?.stroke || "#DC1E28"}`
                            : layer.type === "group"
                              ? "1px dashed rgba(56,189,248,0.5)"
                              : undefined,
                      color: layer.style?.color ?? "#f8f8fa",
                      fontFamily: resolvedFont?.css ?? layer.style?.fontFamily,
                      fontSize: layer.style?.fontSize ?? 32,
                      fontWeight: layer.style?.fontWeight ?? 400,
                      lineHeight: layer.style?.lineHeight ?? 1.28,
                      textAlign: layer.style?.align ?? "left",
                      display: layer.type === "text" || layer.type === "logo-placeholder" ? "flex" : "block",
                      alignItems: "center",
                      justifyContent:
                        layer.style?.align === "center"
                          ? "center"
                          : layer.style?.align === "right"
                            ? "flex-end"
                            : "flex-start",
                      whiteSpace:
                        layer.overflow?.mode === "wrap"
                          ? "normal"
                          : layer.overflow?.mode === "marquee"
                            ? "nowrap"
                            : "nowrap",
                    }}
                  >
                    {layer.type === "logo-placeholder" ? (
                      <div className="w-full text-center text-[28px] font-black italic text-[#DC1E28]">
                        SEMA <span className="text-[#E020F0]">LIVE</span>
                      </div>
                    ) : null}
                    {layer.type === "text" ? <span className="w-full px-1">{text}</span> : null}
                    <DataBindingBadge label={bindingLabel ?? ""} visible={showDataBindings && Boolean(bindingLabel)} />
                    {layer.type === "image" && imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageSrc}
                        alt={layer.name}
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: layer.style?.objectFit || "contain",
                          pointerEvents: "none",
                        }}
                      />
                    ) : null}
                    {layer.type === "group" ? (
                      <div className="p-2 text-[20px] text-sky-300/80">Group</div>
                    ) : null}
                    {isSelected && !layer.locked && activeTool === "select" ? (
                      <>
                        {(["nw", "ne", "sw", "se", "n", "s", "e", "w"] as ResizeHandleId[]).map(
                          (handle) => (
                            <div
                              key={handle}
                              data-editor-handle=""
                              onPointerDown={(event) => beginTransform(event, "resize", handle)}
                              style={handleStyle(handle, canvasScale)}
                            >
                              <div style={handleInnerStyle(canvasScale)} />
                            </div>
                          ),
                        )}
                        <div style={rotationStemStyle(canvasScale)} />
                        <div
                          data-editor-handle=""
                          onPointerDown={(event) => beginTransform(event, "rotate")}
                          style={rotationHandleStyle(canvasScale)}
                          title="Rotate"
                        >
                          <div style={rotationHandleInnerStyle(canvasScale)} />
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
              {shapePreviewBounds ? (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-sky-400/90"
                  style={{
                    left: shapePreviewBounds.x,
                    top: shapePreviewBounds.y,
                    width: shapePreviewBounds.width,
                    height: shapePreviewBounds.height,
                    borderRadius: shapeDraw?.tool === "ellipse" ? "50%" : undefined,
                    background:
                      shapeDraw?.tool === "ellipse"
                        ? "rgba(61,220,132,0.18)"
                        : "rgba(56,189,248,0.12)",
                  }}
                />
              ) : null}
              {(schema.guides ?? []).map((guide) =>
                guide.orientation === "vertical" ? (
                  <div
                    key={guide.id}
                    className="absolute top-0 z-[9998] h-full w-2 -translate-x-1/2 cursor-ew-resize"
                    style={{ left: guide.position }}
                    onPointerDown={(event) => beginCanvasGuideDrag(event, guide)}
                    onPointerMove={(event) => {
                      if (guideDragRef.current?.guideId === guide.id) {
                        moveCanvasGuideDrag(event.clientX, event.clientY);
                      }
                    }}
                    onPointerUp={(event) => {
                      if (guideDragRef.current?.guideId === guide.id) {
                        endCanvasGuideDrag(event);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      commitDocumentGuides(
                        removeGuide(schema.guides ?? [], guide.id),
                        "Delete Guide",
                      );
                    }}
                  >
                    <div className="pointer-events-none mx-auto h-full w-px bg-cyan-500/80" />
                  </div>
                ) : (
                  <div
                    key={guide.id}
                    className="absolute left-0 z-[9998] h-2 w-full -translate-y-1/2 cursor-ns-resize"
                    style={{ top: guide.position }}
                    onPointerDown={(event) => beginCanvasGuideDrag(event, guide)}
                    onPointerMove={(event) => {
                      if (guideDragRef.current?.guideId === guide.id) {
                        moveCanvasGuideDrag(event.clientX, event.clientY);
                      }
                    }}
                    onPointerUp={(event) => {
                      if (guideDragRef.current?.guideId === guide.id) {
                        endCanvasGuideDrag(event);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      commitDocumentGuides(
                        removeGuide(schema.guides ?? [], guide.id),
                        "Delete Guide",
                      );
                    }}
                  >
                    <div className="pointer-events-none my-auto h-px w-full bg-cyan-500/80" />
                  </div>
                ),
              )}
              {activeGuides.map((guide, index) =>
                guide.orientation === "v" ? (
                  <div
                    key={`g-${index}`}
                    className="pointer-events-none absolute top-0 w-px bg-fuchsia-400"
                    style={{ left: guide.pos, height: schema.height }}
                  />
                ) : (
                  <div
                    key={`g-${index}`}
                    className="pointer-events-none absolute left-0 h-px bg-fuchsia-400"
                    style={{ top: guide.pos, width: schema.width }}
                  />
                ),
              )}
              {activeMeasurements.map((measurement, index) => (
                <div
                  key={`m-${index}`}
                  className="pointer-events-none absolute text-[10px] font-medium text-fuchsia-200"
                  style={
                    measurement.orientation === "v"
                      ? { left: measurement.pos, top: measurement.from + 4 }
                      : { top: measurement.pos, left: measurement.from + 4 }
                  }
                >
                  {measurement.distance}px
                </div>
              ))}
            </div>
          </div>
          </EditorRulers>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-neutral-800 bg-neutral-950">
          <div className="flex shrink-0 border-b border-neutral-800 text-[11px]">
            {(
              [
                ["properties", "Properties"],
                ["data", "Data Source"],
                ["design", "Design"],
                ["animations", "Animations"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                className={`flex-1 px-1 py-2 ${
                  rightTab === id
                    ? "border-b-2 border-sky-500 text-sky-200"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
                onClick={() => setRightTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
          {rightTab === "properties" ? (
          <>
          {!selected ? (
            <p className="text-xs text-neutral-500">Select a layer</p>
          ) : (
            <div className="space-y-1 text-xs">
              <label className="mb-2 block px-3 pt-1">
                Name
                <input
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                />
              </label>
              <CollapsibleSection
                title="Transform"
                open={propSections.transform}
                onToggle={() =>
                  setPropSections((current) => ({ ...current, transform: !current.transform }))
                }
              >
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["x", selected.x],
                      ["y", selected.y],
                      ["width", selected.width],
                      ["height", selected.height],
                      ["rotation", selected.rotation || 0],
                      ["opacity", selected.opacity ?? 1],
                    ] as const
                  ).map(([key, value]) => (
                    <label key={key} className="block capitalize">
                      {key === "width" ? "W" : key === "height" ? "H" : key}
                      <input
                        type="number"
                        step={key === "opacity" ? 0.05 : pixelPerfect ? 1 : 1}
                        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                        value={value}
                        onChange={(event) => {
                          const raw = Number(event.target.value);
                          const next =
                            key === "opacity"
                              ? raw
                              : pixelPerfect
                                ? Math.round(raw || 0)
                                : raw || 0;
                          updateSelected({ [key]: next } as Partial<EditableLayer>);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={toolbarBtn(false)}
                    onClick={() =>
                      updateSelected({
                        scaleX: -1 * (selected.scaleX ?? 1),
                      } as Partial<EditableLayer>)
                    }
                  >
                    Flip H
                  </button>
                  <button
                    type="button"
                    className={toolbarBtn(false)}
                    onClick={() =>
                      updateSelected({
                        scaleY: -1 * (selected.scaleY ?? 1),
                      } as Partial<EditableLayer>)
                    }
                  >
                    Flip V
                  </button>
                </div>
              </CollapsibleSection>

              {selected.type === "text" ? (
                <CollapsibleSection
                  title="Typography"
                  open={propSections.typography}
                  onToggle={() =>
                    setPropSections((current) => ({
                      ...current,
                      typography: !current.typography,
                    }))
                  }
                >
                  <label className="block">
                    Text source
                    <select
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={
                        selected.content?.textMode === "data"
                          ? "data"
                          : selected.content?.textMode === "expression"
                            ? "expression"
                            : "static"
                      }
                      onChange={(event) => {
                        const mode = event.target.value;
                        updateSelected({
                          content: {
                            ...selected.content,
                            textMode:
                              mode === "data"
                                ? "data"
                                : mode === "expression"
                                  ? "expression"
                                  : "static",
                            expression:
                              mode === "expression"
                                ? selected.content?.expression ?? "LOT {now.title} — {now.description}"
                                : selected.content?.expression,
                          },
                        });
                      }}
                    >
                      <option value="static">Static</option>
                      <option value="data">Data Source</option>
                      <option value="expression">Mixed (tokens)</option>
                    </select>
                  </label>
                  {selected.content?.textMode === "expression" ? (
                    <InlineTokenEditor
                      expression={selected.content?.expression ?? ""}
                      onChange={(expression) =>
                        updateSelected({
                          content: {
                            ...selected.content,
                            textMode: "expression",
                            expression,
                          },
                        })
                      }
                    />
                  ) : null}
                  {selected.content?.textMode === "data" ? (
                    <div>
                      <div className="mb-1 text-neutral-400">Data tree</div>
                      <DataTreePicker
                        value={selected.dataBinding}
                        onChange={(binding) => updateSelected({ dataBinding: binding })}
                      />
                      <div className="mt-1 text-[10px] text-neutral-500">
                        Bound:{" "}
                        {DATA_LEAVES.find(
                          (leaf) =>
                            leaf.binding === selected.dataBinding ||
                            leaf.path === selected.dataBinding,
                        )?.label || "—"}
                      </div>
                    </div>
                  ) : (
                    <label className="block">
                      Text
                      <input
                        type="text"
                        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                        value={selected.content?.text ?? ""}
                        onChange={(event) =>
                          updateSelected({
                            content: { ...selected.content, text: event.target.value },
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="block">
                    Font family
                    <input
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.fontFamily ?? ""}
                      onChange={(event) =>
                        updateSelected({ style: { ...selected.style, fontFamily: event.target.value } })
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      Size
                      <input
                        type="number"
                        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                        value={selected.style?.fontSize ?? 32}
                        onChange={(event) =>
                          updateSelected({
                            style: { ...selected.style, fontSize: Number(event.target.value) || 32 },
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      Weight
                      <input
                        type="number"
                        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                        value={selected.style?.fontWeight ?? 400}
                        onChange={(event) =>
                          updateSelected({
                            style: {
                              ...selected.style,
                              fontWeight: Number(event.target.value) || 400,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="block">
                    Color
                    <input
                      type="text"
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.color ?? "#f8f8fa"}
                      onChange={(event) =>
                        updateSelected({ style: { ...selected.style, color: event.target.value } })
                      }
                    />
                  </label>
                  <label className="block">
                    Align
                    <select
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.align ?? "left"}
                      onChange={(event) =>
                        updateSelected({
                          style: {
                            ...selected.style,
                            align: event.target.value as EditableTextAlign,
                          },
                        })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label className="block">
                    Line height
                    <input
                      type="number"
                      step={0.05}
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.lineHeight ?? 1.28}
                      onChange={(event) =>
                        updateSelected({
                          style: {
                            ...selected.style,
                            lineHeight: Number(event.target.value) || 1.28,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    Overflow
                    <select
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.overflow?.mode ?? "truncate"}
                      onChange={(event) =>
                        updateSelected({
                          overflow: {
                            ...selected.overflow,
                            mode: event.target.value as EditableOverflowMode,
                          },
                        })
                      }
                    >
                      <option value="truncate">Truncate</option>
                      <option value="wrap">Wrap</option>
                      <option value="shrink">Shrink</option>
                      <option value="marquee">Marquee</option>
                    </select>
                  </label>
                  <ColorField
                    label="Color"
                    value={selected.style?.color ?? "#f8f8fa"}
                    brandColors={SAMPLE_SEMA_BRAND_KIT.colors}
                    onChange={(color) =>
                      updateSelected({ style: { ...selected.style, color } })
                    }
                  />
                </CollapsibleSection>
              ) : null}

              {(selected.type === "rect" ||
                selected.type === "ellipse" ||
                selected.type === "line") && (
                <CollapsibleSection
                  title="Appearance"
                  open={propSections.appearance}
                  onToggle={() =>
                    setPropSections((current) => ({
                      ...current,
                      appearance: !current.appearance,
                    }))
                  }
                >
                  <ColorField
                    label="Fill"
                    value={selected.style?.fill ?? "#ffffff"}
                    brandColors={SAMPLE_SEMA_BRAND_KIT.colors}
                    onChange={(fill) =>
                      updateSelected({ style: { ...selected.style, fill } })
                    }
                  />
                  <label className="mt-2 block">
                    Stroke
                    <input
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.stroke ?? ""}
                      onChange={(event) =>
                        updateSelected({ style: { ...selected.style, stroke: event.target.value } })
                      }
                    />
                  </label>
                  <label className="block">
                    Stroke width
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.strokeWidth ?? 0}
                      onChange={(event) =>
                        updateSelected({
                          style: {
                            ...selected.style,
                            strokeWidth: Number(event.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                </CollapsibleSection>
              )}

              {selected.type === "image" ? (
                <CollapsibleSection
                  title="Image"
                  open={propSections.appearance}
                  onToggle={() =>
                    setPropSections((current) => ({
                      ...current,
                      appearance: !current.appearance,
                    }))
                  }
                >
                  <label className="block">
                    Image fit
                    <select
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={selected.style?.objectFit ?? "contain"}
                      onChange={(event) =>
                        updateSelected({
                          style: {
                            ...selected.style,
                            objectFit: event.target.value as "contain" | "cover" | "fill" | "none",
                          },
                        })
                      }
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                      <option value="fill">Fill</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={toolbarBtn(false)}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      Upload New
                    </button>
                    <button
                      type="button"
                      className={toolbarBtn(false)}
                      onClick={() => {
                        setLeftPanel("assets");
                        setStatus("Choose an asset from the library.");
                      }}
                    >
                      Choose Existing
                    </button>
                  </div>
                </CollapsibleSection>
              ) : null}

            </div>
          )}
          </>
          ) : null}
          {rightTab === "data" ? (
            <div className="space-y-3 text-xs">
              <div className="space-y-1.5 rounded border border-neutral-800 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  Preview Data
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={toolbarBtn(false, dataMode === "sample")}
                    onClick={() => setDataMode("sample")}
                  >
                    Sample
                  </button>
                  <button
                    type="button"
                    className={toolbarBtn(false, dataMode === "live")}
                    onClick={() => setDataMode("live")}
                  >
                    Live
                  </button>
                </div>
                <p className="text-[10px] text-neutral-500">
                  {dataMode === "sample"
                    ? "Sample data (editor only — never writes production state)"
                    : "Live project data (read-only)"}
                </p>
                <button
                  type="button"
                  className={`${toolbarBtn(!liveSchedule)} w-full`}
                  disabled={!liveSchedule}
                  onClick={() => {
                    if (!liveSchedule) return;
                    const id = `captured-${Date.now()}`;
                    const next: SampleScenario = {
                      id,
                      name: "Captured Live",
                      schedule: liveSchedule,
                    };
                    setSampleScenarios((current) => [...current, next]);
                    setActiveScenarioId(id);
                    setDataMode("sample");
                    setSchedule(liveSchedule);
                    setStatus("Captured live values as editor-only sample (canonical unchanged).");
                  }}
                >
                  Capture Live as Sample
                </button>
              </div>
              <div className="space-y-1 rounded border border-neutral-800 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  Named Scenarios
                </div>
                {sampleScenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    className={`block w-full rounded border px-2 py-1 text-left ${
                      activeScenarioId === scenario.id
                        ? "border-sky-600 bg-sky-950/40"
                        : "border-neutral-800 hover:bg-neutral-900"
                    }`}
                    onClick={() => {
                      setActiveScenarioId(scenario.id);
                      setDataMode("sample");
                      setSchedule(scenario.schedule as SchedulePreview);
                    }}
                  >
                    {scenario.name}
                  </button>
                ))}
              </div>
              <DataTreePicker
                value={selected?.dataBinding}
                onChange={(binding) =>
                  updateSelected({
                    dataBinding: binding,
                    content: { ...selected?.content, textMode: "data" },
                  })
                }
              />
              {selected?.visibilityCondition || selected ? (
                <div className="space-y-1 rounded border border-neutral-800 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Show Layer When
                  </div>
                  <select
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    value={selected?.visibilityCondition?.binding ?? ""}
                    onChange={(event) =>
                      updateSelected({
                        visibilityCondition: event.target.value
                          ? {
                              binding: event.target.value,
                              operator: selected?.visibilityCondition?.operator ?? "equals",
                              value: selected?.visibilityCondition?.value ?? "",
                            }
                          : null,
                      })
                    }
                  >
                    <option value="">Always visible</option>
                    {DATA_LEAVES.map((leaf) => (
                      <option key={leaf.binding} value={leaf.binding}>
                        {leaf.label}
                      </option>
                    ))}
                  </select>
                  {selected?.visibilityCondition ? (
                    <>
                      <select
                        className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                        value={selected.visibilityCondition.operator}
                        onChange={(event) =>
                          updateSelected({
                            visibilityCondition: {
                              ...selected.visibilityCondition!,
                              operator: event.target.value as
                                | "equals"
                                | "doesNotEqual"
                                | "isEmpty"
                                | "isNotEmpty"
                                | "greaterThan"
                                | "lessThan",
                            },
                          })
                        }
                      >
                        <option value="equals">Equals</option>
                        <option value="doesNotEqual">Does not equal</option>
                        <option value="isEmpty">Is empty</option>
                        <option value="isNotEmpty">Is not empty</option>
                      </select>
                      <input
                        className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                        placeholder="Value"
                        value={selected.visibilityCondition.value ?? ""}
                        onChange={(event) =>
                          updateSelected({
                            visibilityCondition: {
                              ...selected.visibilityCondition!,
                              value: event.target.value,
                            },
                          })
                        }
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="border-t border-neutral-800 pt-2">
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  Brand Kit
                </h3>
                <div className="flex flex-wrap gap-1">
                  {SAMPLE_SEMA_BRAND_KIT.colors.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      title={color.name}
                      aria-label={color.name}
                      className="h-6 w-6 rounded border border-neutral-700"
                      style={{ backgroundColor: color.value }}
                      onClick={() => {
                        if (!selected) return;
                        if (selected.type === "text") {
                          updateSelected({ style: { ...selected.style, color: color.value } });
                        } else {
                          updateSelected({ style: { ...selected.style, fill: color.value } });
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {rightTab === "design" ? (
            <EditorDesignPanel
              schema={{ ...schema, brandKit }}
              selected={selected}
              selectedIds={selectedIds}
              brandKit={brandKit}
              onBrandKitChange={(kit) => {
                setBrandKit({ ...kit, projectId });
                pushHistory({ ...schema, brandKit: kit }, "Edit Brand Kit");
              }}
              onSchemaChange={(next, label) => commitSchema({ ...next, brandKit }, label)}
            />
          ) : null}
          {rightTab === "animations" ? (
            <div className="space-y-3 text-xs">
              {multiSelected.length >= 2 ? (
                <div className="rounded border border-neutral-800 p-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Stagger Animation
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[100, 200, 300].map((interval) => (
                      <button
                        key={interval}
                        type="button"
                        className={toolbarBtn(false)}
                        onClick={() => {
                          if (!schema) return;
                          const next = cloneSchema(schema);
                          const ordered = [...multiSelected].sort((a, b) => a.y - b.y);
                          next.layers = next.layers.map((layer) => {
                            const index = ordered.findIndex((entry) => entry.id === layer.id);
                            if (index < 0) return layer;
                            return {
                              ...layer,
                              animations: {
                                ...layer.animations,
                                in: {
                                  preset: layer.animations?.in?.preset ?? "fade",
                                  ...layer.animations?.in,
                                  delayMs: index * interval,
                                },
                              },
                            };
                          });
                          commitSchema(next);
                          setStatus(`Staggered IN by ${interval}ms (top → bottom).`);
                        }}
                      >
                        {interval}ms
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!selected ? (
                <p className="text-neutral-500">Select a layer to edit animations</p>
              ) : (
                <div className="space-y-2">
                  {(["in", "update", "out"] as const).map((slot) => {
                    const anim = selected.animations?.[slot];
                    return (
                      <div key={slot} className="rounded border border-neutral-800 p-2">
                        <div className="mb-1 font-semibold uppercase tracking-wide text-neutral-400">
                          {slot}
                        </div>
                        <label className="block">
                          Preset
                          <select
                            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                            value={anim?.preset ?? "none"}
                            onChange={(event) =>
                              updateSelected({
                                animations: {
                                  ...selected.animations,
                                  [slot]: {
                                    ...anim,
                                    preset: event.target.value as EditableAnimPreset,
                                    durationMs: anim?.durationMs ?? 300,
                                    delayMs: anim?.delayMs ?? 0,
                                    easing: anim?.easing ?? "ease-out",
                                  },
                                },
                              })
                            }
                          >
                            <option value="none">None</option>
                            <option value="fade">Fade</option>
                            <option value="slide">Slide</option>
                            <option value="scale">Scale</option>
                          </select>
                        </label>
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          <label>
                            Duration
                            <input
                              type="number"
                              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                              value={anim?.durationMs ?? 300}
                              onChange={(event) =>
                                updateSelected({
                                  animations: {
                                    ...selected.animations,
                                    [slot]: {
                                      preset: anim?.preset ?? "fade",
                                      ...anim,
                                      durationMs: Number(event.target.value) || 0,
                                    },
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Delay
                            <input
                              type="number"
                              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                              value={anim?.delayMs ?? 0}
                              onChange={(event) =>
                                updateSelected({
                                  animations: {
                                    ...selected.animations,
                                    [slot]: {
                                      preset: anim?.preset ?? "fade",
                                      ...anim,
                                      delayMs: Number(event.target.value) || 0,
                                    },
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <label className="mt-1 block">
                          Easing
                          <select
                            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                            value={anim?.easing ?? "ease-out"}
                            onChange={(event) =>
                              updateSelected({
                                animations: {
                                  ...selected.animations,
                                  [slot]: {
                                    preset: anim?.preset ?? "fade",
                                    durationMs: anim?.durationMs ?? 300,
                                    delayMs: anim?.delayMs ?? 0,
                                    ...anim,
                                    easing: event.target.value,
                                  },
                                },
                              })
                            }
                          >
                            <option value="linear">Linear</option>
                            <option value="ease">Ease</option>
                            <option value="ease-in">Ease In</option>
                            <option value="ease-out">Ease Out</option>
                            <option value="ease-in-out">Ease In Out</option>
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-1 border-t border-neutral-800 pt-2">
                {(["in", "update", "out"] as const).map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    className={toolbarBtn(false)}
                    onClick={() =>
                      setStatus(`Preview ${phase.toUpperCase()} (editor only — live data unchanged)`)
                    }
                  >
                    Preview {phase.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          </div>
        </aside>
      </div>

      {layerMenu ? (
        <div
          className="fixed z-50 min-w-[12rem] rounded border border-neutral-700 bg-neutral-900 py-1 text-xs shadow-xl"
          style={{ left: layerMenu.x, top: layerMenu.y }}
          onMouseLeave={() => setLayerMenu(null)}
        >
          {(
            [
              ["Duplicate Layer", () => duplicateLayer(layerMenu.layerId)],
              ["Delete Layer", () => deleteLayer(layerMenu.layerId)],
              ["Group Selected", () => groupSelectedWithSiblings()],
              [
                "Ungroup",
                () => {
                  const layer = schema.layers.find((entry) => entry.id === layerMenu.layerId);
                  if (layer?.parentId) {
                    const next = cloneSchema(schema);
                    next.layers = next.layers.map((entry) =>
                      entry.id === layerMenu.layerId ? { ...entry, parentId: null } : entry,
                    );
                    commitSchema(next);
                  }
                },
              ],
            ] as const
          ).map(([label, action]) => (
            <button
              key={label}
              type="button"
              className="block w-full px-3 py-1.5 text-left hover:bg-neutral-800"
              onClick={() => {
                action();
                setLayerMenu(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-t border-neutral-800 bg-neutral-950 px-3 py-1 text-[10px] text-neutral-500">
        History: {history.length} undo · {future.length} redo · open History panel to jump
      </div>

      <VersionCompareModal
        open={compareOpen}
        leftLabel={savedBaselineSchema ? "Last Saved Draft" : "Baseline"}
        rightLabel="Current Draft"
        leftSchema={savedBaselineSchema ?? schema}
        rightSchema={schema}
        onClose={() => setCompareOpen(false)}
        renderStage={(compareSchema, scale) => (
          <div
            className="relative origin-top-left bg-neutral-900"
            style={{
              width: compareSchema.width,
              height: compareSchema.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {[...compareSchema.layers]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((layer) => {
                if (layer.visible === false) return null;
                const text =
                  layer.type === "text"
                    ? resolveLayerDisplayText(layer, previewSchedule)
                    : "";
                return (
                  <div
                    key={layer.id}
                    className="absolute overflow-hidden"
                    style={{
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      opacity: layer.opacity ?? 1,
                      color: layer.style?.color,
                      fontSize: layer.style?.fontSize,
                      background:
                        layer.type === "rect"
                          ? layer.style?.fill
                          : layer.type === "ellipse"
                            ? layer.style?.fill
                            : undefined,
                      borderRadius: layer.type === "ellipse" ? "50%" : undefined,
                    }}
                  >
                    {layer.type === "text" ? text : null}
                  </div>
                );
              })}
          </div>
        )}
      />
    </div>
  );
}

function SortableEditorLayerRow({
  layer,
  selected,
  renaming,
  onSelect,
  onContextMenu,
  onToggleVisible,
  onToggleLock,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
}: {
  layer: EditableLayer;
  selected: boolean;
  renaming: boolean;
  onSelect: (event: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onRenameStart: () => void;
  onRenameChange: (name: string) => void;
  onRenameCommit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: layer.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded px-2 py-1.5 text-xs ${
        selected ? "bg-neutral-800" : "hover:bg-neutral-900"
      } ${isDragging ? "z-10" : ""}`}
      onClick={(event) => onSelect(event)}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Drag to reorder"
          aria-label={`Reorder ${layer.name}`}
          className="cursor-grab touch-none px-0.5 text-neutral-500 active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          title="Visibility"
          aria-label={layer.visible === false ? "Show layer" : "Hide layer"}
          className="w-5 text-[11px] text-neutral-400"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisible();
          }}
        >
          {layer.visible === false ? "○" : "●"}
        </button>
        <button
          type="button"
          title="Lock"
          aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
          className="w-5 text-[11px] text-neutral-400"
          onClick={(event) => {
            event.stopPropagation();
            onToggleLock();
          }}
        >
          {layer.locked ? "🔒" : "🔓"}
        </button>
        {renaming ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
            value={layer.name}
            onChange={(event) => onRenameChange(event.target.value)}
            onBlur={() => onRenameCommit()}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onDoubleClick={(event) => {
              event.stopPropagation();
              onRenameStart();
            }}
          >
            {layer.parentId ? "↳ " : ""}
            {layer.name}
            <span className="ml-1 text-[10px] text-neutral-500">{layer.type}</span>
          </button>
        )}
      </div>
    </li>
  );
}

function toolbarBtn(disabled: boolean, active = false) {
  return `rounded border px-2.5 py-1.5 text-[11px] ${
    active ? "border-sky-500 bg-sky-950 text-sky-100" : "border-neutral-700"
  } ${disabled ? "opacity-40" : "hover:bg-neutral-900"}`;
}

