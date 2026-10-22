/**
 * Editable graphic schema (editorSchemaVersion 2).
 * Used by Schedule Ticker Editable — schema is the source of truth for layout.
 * v1 documents are migrated via migrateV1ToV2 / normalizeEditableGraphicSchema.
 */

import { normalizeDataBindingPath } from "./graphic-data-registry";

export const EDITABLE_GRAPHIC_SCHEMA_VERSION = 2 as const;
export const EDITABLE_GRAPHIC_SCHEMA_VERSION_V1 = 1 as const;
export const SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE = "schedule-ticker-editable" as const;

export type EditableDataBinding =
  | "now.title"
  | "now.description"
  | "next.title"
  | "next.description"
  | "later.title"
  | "later.description"
  | "schedule.now.title"
  | "schedule.now.description"
  | "schedule.next.title"
  | "schedule.next.description"
  | "schedule.later.title"
  | "schedule.later.description";

export type EditableTextAlign = "left" | "center" | "right";

export type EditableLayerType =
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "image"
  | "group"
  | "logo-placeholder";

export type EditableTextMode = "static" | "data";

export type EditableOverflowMode = "shrink" | "wrap" | "marquee" | "truncate";

export type EditableOverflow = {
  mode: EditableOverflowMode;
  /** Marquee speed (px/s) or shrink min font size, etc. */
  options?: {
    minFontSize?: number;
    speed?: number;
    gap?: number;
  };
};

export type EditableAnimPreset = "none" | "fade" | "slide" | "scale";

export type EditableAnimation = {
  preset: EditableAnimPreset;
  durationMs?: number;
  delayMs?: number;
  /** slide direction when preset is slide */
  direction?: "up" | "down" | "left" | "right";
};

export type EditableLayerAnimations = {
  in?: EditableAnimation;
  out?: EditableAnimation;
  update?: EditableAnimation;
};

export type EditableLayerStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: EditableTextAlign;
  lineHeight?: number;
  objectFit?: "contain" | "cover" | "fill" | "none";
};

export type EditableLayerContent = {
  text?: string;
  textMode?: EditableTextMode;
  /** Relative asset path, e.g. assets/logo.png — never absolute */
  src?: string;
};

export type EditableGuide = {
  id: string;
  orientation: "horizontal" | "vertical";
  position: number;
};

export type EditableLayer = {
  id: string;
  parentId?: string | null;
  type: EditableLayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  style: EditableLayerStyle;
  content: EditableLayerContent;
  dataBinding?: EditableDataBinding | string;
  overflow: EditableOverflow;
  animations: EditableLayerAnimations;
  /** Relative asset id/path under display assets */
  assetId?: string | null;
};

export type EditableGraphicBackground = {
  color?: string;
};

export type EditableGraphicSchema = {
  schemaVersion: typeof EDITABLE_GRAPHIC_SCHEMA_VERSION;
  graphicType: typeof SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE;
  width: number;
  height: number;
  background: EditableGraphicBackground;
  guides: EditableGuide[];
  layers: EditableLayer[];
};

/** Legacy v1 shape (for migration only). */
export type EditableGraphicSchemaV1 = {
  schemaVersion: 1;
  graphicType: typeof SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE;
  canvas: { width: number; height: number };
  layers: Array<{
    id: string;
    name: string;
    type: "text" | "rect" | "logo-placeholder";
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    zIndex: number;
    text?: string;
    textMode?: EditableTextMode;
    dataBinding?: string;
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    align?: EditableTextAlign;
    backgroundColor?: string;
    borderColor?: string;
  }>;
};

export const EDITABLE_DATA_BINDING_OPTIONS: Array<{
  value: EditableDataBinding;
  label: string;
  path: string;
}> = [
  { value: "now.title", label: "NOW Title", path: "schedule.now.title" },
  { value: "now.description", label: "NOW Description", path: "schedule.now.description" },
  { value: "next.title", label: "NEXT Title", path: "schedule.next.title" },
  { value: "next.description", label: "NEXT Description", path: "schedule.next.description" },
  { value: "later.title", label: "LATER Title", path: "schedule.later.title" },
  { value: "later.description", label: "LATER Description", path: "schedule.later.description" },
];

function emptyStyle(): EditableLayerStyle {
  return {};
}

function emptyContent(): EditableLayerContent {
  return {};
}

function defaultOverflow(): EditableOverflow {
  return { mode: "truncate" };
}

function defaultAnimations(): EditableLayerAnimations {
  return {};
}

export function createLayerId(prefix = "layer"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyLayer(
  type: EditableLayerType,
  partial?: Partial<EditableLayer>,
): EditableLayer {
  const base: EditableLayer = {
    id: createLayerId(type),
    parentId: null,
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    x: 100,
    y: 100,
    width: type === "line" ? 400 : 320,
    height: type === "line" ? 4 : type === "text" ? 64 : 200,
    rotation: 0,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    style: emptyStyle(),
    content: emptyContent(),
    overflow: defaultOverflow(),
    animations: defaultAnimations(),
    assetId: null,
  };
  if (type === "text") {
    base.content = { text: "Text", textMode: "static" };
    base.style = {
      fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif",
      fontSize: 48,
      fontWeight: 700,
      color: "rgba(248, 248, 250, 0.96)",
      align: "left",
      lineHeight: 1.28,
    };
  } else if (type === "rect") {
    base.style = { fill: "rgba(8, 8, 10, 0.92)", stroke: "#DC1E28", strokeWidth: 0 };
  } else if (type === "ellipse") {
    base.style = { fill: "rgba(61, 220, 132, 0.35)", stroke: "#3DDC84", strokeWidth: 2 };
  } else if (type === "line") {
    base.style = { stroke: "#DC1E28", strokeWidth: 4, fill: "transparent" };
  } else if (type === "image") {
    base.style = { objectFit: "contain" };
    base.content = { src: "" };
  } else if (type === "group") {
    base.width = 400;
    base.height = 300;
  } else if (type === "logo-placeholder") {
    base.name = "Logo Placeholder";
  }
  return { ...base, ...partial, style: { ...base.style, ...partial?.style }, content: { ...base.content, ...partial?.content } };
}

/** Authored coords matching the Schedule Ticker bar layout (3840×2160). */
export function createDefaultSemaScheduleTickerEditableSchema(): EditableGraphicSchema {
  const barY = 1880;
  const barH = 280;
  const padX = 56;
  const logoW = 480;
  const sectionW = (3840 - padX * 2 - logoW) / 3;

  const layers: EditableLayer[] = [
    createEmptyLayer("rect", {
      id: "bar-bg",
      name: "Ticker Bar",
      x: 0,
      y: barY,
      width: 3840,
      height: barH,
      zIndex: 0,
      style: { fill: "rgba(8, 8, 10, 0.92)", stroke: "#DC1E28", strokeWidth: 0 },
    }),
    createEmptyLayer("logo-placeholder", {
      id: "logo",
      name: "Logo Placeholder",
      x: padX,
      y: barY + 36,
      width: logoW - 16,
      height: barH - 72,
      zIndex: 1,
    }),
    createEmptyLayer("text", {
      id: "now-label",
      name: "NOW Label",
      x: padX + logoW,
      y: barY + 44,
      width: sectionW - 48,
      height: 40,
      zIndex: 2,
      content: { text: "NOW", textMode: "static" },
      style: { fontSize: 28, fontWeight: 800, color: "#3DDC84", align: "left", lineHeight: 1.28 },
    }),
    createEmptyLayer("text", {
      id: "now-title",
      name: "NOW Title",
      x: padX + logoW,
      y: barY + 96,
      width: sectionW - 48,
      height: 64,
      zIndex: 3,
      content: { text: "", textMode: "data" },
      dataBinding: "now.title",
      style: {
        fontSize: 57,
        fontWeight: 800,
        color: "rgba(248, 248, 250, 0.96)",
        align: "left",
        lineHeight: 1.28,
      },
      overflow: { mode: "truncate" },
      animations: { update: { preset: "fade", durationMs: 280 } },
    }),
    createEmptyLayer("text", {
      id: "now-description",
      name: "NOW Description",
      x: padX + logoW,
      y: barY + 168,
      width: sectionW - 48,
      height: 48,
      zIndex: 4,
      content: { text: "", textMode: "data" },
      dataBinding: "now.description",
      style: {
        fontSize: 52,
        fontWeight: 400,
        color: "rgba(210, 212, 220, 0.72)",
        align: "left",
        lineHeight: 1.28,
      },
    }),
    createEmptyLayer("text", {
      id: "next-label",
      name: "NEXT Label",
      x: padX + logoW + sectionW,
      y: barY + 44,
      width: sectionW - 48,
      height: 40,
      zIndex: 5,
      content: { text: "NEXT", textMode: "static" },
      style: { fontSize: 28, fontWeight: 800, color: "#5BA8FF", align: "left", lineHeight: 1.28 },
    }),
    createEmptyLayer("text", {
      id: "next-title",
      name: "NEXT Title",
      x: padX + logoW + sectionW,
      y: barY + 96,
      width: sectionW - 48,
      height: 64,
      zIndex: 6,
      content: { text: "", textMode: "data" },
      dataBinding: "next.title",
      style: {
        fontSize: 57,
        fontWeight: 700,
        color: "rgba(248, 248, 250, 0.96)",
        align: "left",
        lineHeight: 1.28,
      },
    }),
    createEmptyLayer("text", {
      id: "next-description",
      name: "NEXT Description",
      x: padX + logoW + sectionW,
      y: barY + 168,
      width: sectionW - 48,
      height: 48,
      zIndex: 7,
      content: { text: "", textMode: "data" },
      dataBinding: "next.description",
      style: {
        fontSize: 52,
        fontWeight: 400,
        color: "rgba(210, 212, 220, 0.72)",
        align: "left",
        lineHeight: 1.28,
      },
    }),
    createEmptyLayer("text", {
      id: "later-label",
      name: "LATER Label",
      x: padX + logoW + sectionW * 2,
      y: barY + 44,
      width: sectionW - 48,
      height: 40,
      zIndex: 8,
      content: { text: "LATER", textMode: "static" },
      style: { fontSize: 28, fontWeight: 800, color: "#F0A030", align: "left", lineHeight: 1.28 },
    }),
    createEmptyLayer("text", {
      id: "later-title",
      name: "LATER Title",
      x: padX + logoW + sectionW * 2,
      y: barY + 96,
      width: sectionW - 48,
      height: 64,
      zIndex: 9,
      content: { text: "", textMode: "data" },
      dataBinding: "later.title",
      style: {
        fontSize: 57,
        fontWeight: 700,
        color: "rgba(248, 248, 250, 0.96)",
        align: "left",
        lineHeight: 1.28,
      },
    }),
    createEmptyLayer("text", {
      id: "later-description",
      name: "LATER Description",
      x: padX + logoW + sectionW * 2,
      y: barY + 168,
      width: sectionW - 48,
      height: 48,
      zIndex: 10,
      content: { text: "", textMode: "data" },
      dataBinding: "later.description",
      style: {
        fontSize: 52,
        fontWeight: 400,
        color: "rgba(210, 212, 220, 0.72)",
        align: "left",
        lineHeight: 1.28,
      },
    }),
  ];

  return {
    schemaVersion: EDITABLE_GRAPHIC_SCHEMA_VERSION,
    graphicType: SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE,
    width: 3840,
    height: 2160,
    background: { color: "transparent" },
    guides: [],
    layers,
  };
}

export function migrateV1ToV2(v1: EditableGraphicSchemaV1): EditableGraphicSchema {
  const width = v1.canvas?.width === 3840 ? 3840 : Number(v1.canvas?.width) || 3840;
  const height = v1.canvas?.height === 2160 ? 2160 : Number(v1.canvas?.height) || 2160;
  return {
    schemaVersion: 2,
    graphicType: SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE,
    width,
    height,
    background: { color: "transparent" },
    guides: [],
    layers: (v1.layers || []).map((layer, index) => {
      const type = (layer.type || "rect") as EditableLayerType;
      return {
        id: String(layer.id || createLayerId("migrated")),
        parentId: null,
        type: type === "text" || type === "rect" || type === "logo-placeholder" ? type : "rect",
        name: String(layer.name || `Layer ${index + 1}`),
        x: Number(layer.x) || 0,
        y: Number(layer.y) || 0,
        width: Number(layer.width) || 100,
        height: Number(layer.height) || 100,
        rotation: 0,
        zIndex: typeof layer.zIndex === "number" ? layer.zIndex : index,
        visible: layer.visible !== false,
        locked: false,
        opacity: 1,
        style: {
          fill: layer.backgroundColor,
          stroke: layer.borderColor,
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          color: layer.color,
          align: layer.align,
          lineHeight: 1.28,
        },
        content: {
          text: layer.text,
          textMode: layer.textMode,
        },
        dataBinding: layer.dataBinding,
        overflow: defaultOverflow(),
        animations: defaultAnimations(),
        assetId: null,
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isEditableGraphicSchemaV1(value: unknown): value is EditableGraphicSchemaV1 {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.graphicType !== SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE) return false;
  if (!isRecord(value.canvas)) return false;
  return Array.isArray(value.layers);
}

export function isEditableGraphicSchema(value: unknown): value is EditableGraphicSchema {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== EDITABLE_GRAPHIC_SCHEMA_VERSION) return false;
  if (value.graphicType !== SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE) return false;
  if (value.width !== 3840 || value.height !== 2160) return false;
  return Array.isArray(value.layers);
}

function coerceLayer(raw: unknown, index: number): EditableLayer {
  const layer = isRecord(raw) ? raw : {};
  const type = (typeof layer.type === "string" ? layer.type : "rect") as EditableLayerType;
  const style = isRecord(layer.style) ? (layer.style as EditableLayerStyle) : emptyStyle();
  const content = isRecord(layer.content)
    ? (layer.content as EditableLayerContent)
    : emptyContent();
  // Tolerate partially-migrated docs that still have flat v1 fields.
  if (layer.backgroundColor && !style.fill) style.fill = String(layer.backgroundColor);
  if (layer.borderColor && !style.stroke) style.stroke = String(layer.borderColor);
  if (layer.fontSize != null && style.fontSize == null) style.fontSize = Number(layer.fontSize);
  if (layer.fontWeight != null && style.fontWeight == null) {
    style.fontWeight = Number(layer.fontWeight);
  }
  if (layer.color && !style.color) style.color = String(layer.color);
  if (layer.align && !style.align) style.align = layer.align as EditableTextAlign;
  if (layer.text != null && content.text == null) content.text = String(layer.text);
  if (layer.textMode && !content.textMode) content.textMode = layer.textMode as EditableTextMode;

  const overflow = isRecord(layer.overflow)
    ? (layer.overflow as EditableOverflow)
    : defaultOverflow();
  const animations = isRecord(layer.animations)
    ? (layer.animations as EditableLayerAnimations)
    : defaultAnimations();

  return {
    id: typeof layer.id === "string" ? layer.id : createLayerId("layer"),
    parentId: typeof layer.parentId === "string" ? layer.parentId : null,
    type,
    name: typeof layer.name === "string" ? layer.name : `Layer ${index + 1}`,
    x: Number(layer.x) || 0,
    y: Number(layer.y) || 0,
    width: Number(layer.width) || 100,
    height: Number(layer.height) || 100,
    rotation: Number(layer.rotation) || 0,
    zIndex: typeof layer.zIndex === "number" ? layer.zIndex : index,
    visible: layer.visible !== false,
    locked: layer.locked === true,
    opacity: typeof layer.opacity === "number" ? Math.min(1, Math.max(0, layer.opacity)) : 1,
    style,
    content,
    dataBinding: typeof layer.dataBinding === "string" ? layer.dataBinding : undefined,
    overflow: {
      mode: (overflow.mode as EditableOverflowMode) || "truncate",
      options: overflow.options,
    },
    animations,
    assetId: typeof layer.assetId === "string" ? layer.assetId : null,
  };
}

export function normalizeEditableGraphicSchema(value: unknown): EditableGraphicSchema {
  if (isEditableGraphicSchema(value)) {
    return {
      ...value,
      background: isRecord(value.background)
        ? value.background
        : { color: "transparent" },
      guides: Array.isArray(value.guides) ? value.guides : [],
      layers: value.layers.map((layer, index) => coerceLayer(layer, index)),
    };
  }
  if (isEditableGraphicSchemaV1(value)) {
    return migrateV1ToV2(value);
  }
  // Accept canvas-shaped docs that already claim version 2.
  if (isRecord(value) && value.graphicType === SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE) {
    if (isRecord(value.canvas) && Array.isArray(value.layers)) {
      return migrateV1ToV2({
        schemaVersion: 1,
        graphicType: SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE,
        canvas: {
          width: Number(value.canvas.width) || 3840,
          height: Number(value.canvas.height) || 2160,
        },
        layers: value.layers as EditableGraphicSchemaV1["layers"],
      });
    }
    if (Array.isArray(value.layers)) {
      return {
        schemaVersion: 2,
        graphicType: SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE,
        width: Number(value.width) === 3840 ? 3840 : 3840,
        height: Number(value.height) === 2160 ? 2160 : 2160,
        background: isRecord(value.background)
          ? (value.background as EditableGraphicBackground)
          : { color: "transparent" },
        guides: Array.isArray(value.guides) ? (value.guides as EditableGuide[]) : [],
        layers: value.layers.map((layer, index) => coerceLayer(layer, index)),
      };
    }
  }
  return createDefaultSemaScheduleTickerEditableSchema();
}

export function displaySupportsGraphicEditor(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  if (!settings || typeof settings !== "object") return false;
  const version = settings.editorSchemaVersion;
  const graphicType = settings.graphicType;
  return (
    (version === 1 || version === 2 || version === EDITABLE_GRAPHIC_SCHEMA_VERSION) &&
    graphicType === SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE
  );
}

/** Escape for safe HTML text nodes — never use with eval/innerHTML of untrusted markup. */
export function escapeEditableText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resolveDataBinding(
  schedule: Record<string, unknown> | null | undefined,
  binding: string | undefined,
): string {
  const normalized = normalizeDataBindingPath(binding);
  if (!normalized || !schedule) return "";
  const [slot, field] = normalized.split(".") as [string, string];
  if (!slot || !field) return "";
  const row = (schedule[slot] ?? schedule[slot.toUpperCase()]) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!row || typeof row !== "object") return "";
  const alt = field === "description" ? "eventDescription" : field;
  const value = row[field] != null ? row[field] : row[alt];
  return typeof value === "string" ? value.trim() : "";
}

/** Canvas size helpers for editor UI that previously used schema.canvas */
export function schemaCanvasSize(schema: EditableGraphicSchema): { width: number; height: number } {
  return { width: schema.width, height: schema.height };
}
