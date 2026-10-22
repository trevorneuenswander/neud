/** Client-side editable graphic schema v2 types (mirrors desktop package + Phase 3 foundations). */

import type { ProjectBrandKit } from "./brand-kit";
import type { ProjectAsset } from "./project-assets";
import type { OperatorSection, TextStyleDefinition } from "./phase4-types";

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
  | "logo-placeholder"
  | "component-instance"
  | "repeater";

export type EditableTextMode = "static" | "data" | "expression";
export type EditableOverflowMode = "shrink" | "wrap" | "marquee" | "truncate";

export type EditableOverflow = {
  mode: EditableOverflowMode;
  options?: { minFontSize?: number; speed?: number; gap?: number };
};

export type EditableAnimPreset = "none" | "fade" | "slide" | "scale";

export type EditableAnimation = {
  preset: EditableAnimPreset;
  durationMs?: number;
  delayMs?: number;
  direction?: "up" | "down" | "left" | "right";
  easing?: string;
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
  cornerRadius?: number;
};

/** Declarative text/number formatters (no JS). */
export type EditableFormatterStep =
  | { type: "case"; value: "upper" | "lower" | "title" }
  | { type: "number"; decimals?: number; commas?: boolean }
  | { type: "currency"; currency?: string; decimals?: number }
  | { type: "date"; format?: "short" | "medium" | "long" | "time" }
  | { type: "prefix"; value: string }
  | { type: "suffix"; value: string }
  | { type: "fallback"; value: string };

export type EditableConditionOperator =
  | "equals"
  | "doesNotEqual"
  | "isEmpty"
  | "isNotEmpty"
  | "greaterThan"
  | "lessThan";

export type EditableVisibilityCondition = {
  binding: string;
  operator: EditableConditionOperator;
  value?: string;
};

export type EditableConditionalStyleRule = {
  binding: string;
  operator: EditableConditionOperator;
  value?: string;
  style: Partial<Pick<EditableLayerStyle, "color" | "fill">> & { opacity?: number };
};

export type EditableLayerEffect =
  | {
      type: "dropShadow";
      color?: string;
      blur?: number;
      offsetX?: number;
      offsetY?: number;
      opacity?: number;
    }
  | {
      type: "outerGlow";
      color?: string;
      blur?: number;
      opacity?: number;
    }
  | {
      type: "stroke";
      color?: string;
      width?: number;
    }
  | {
      type: "fill";
      color?: string;
    }
  | {
      type: "cornerRadius";
      radius?: number;
    };

export type EditableMask = {
  type: "rectangle" | "ellipse";
  inset?: number;
};

export type EditableImageCrop = {
  /** Pan offset in layer-local coords */
  offsetX: number;
  offsetY: number;
  /** Zoom multiplier (1 = fit to frame for contain baseline) */
  zoom: number;
  fit: "contain" | "cover";
};

export type EditableRepeater = {
  direction: "horizontal" | "vertical";
  gap: number;
  maxItems: number;
  /** Binding to array-like data path (foundation) */
  itemsBinding?: string;
};

export type EditableAutoLayout = {
  direction: "horizontal" | "vertical";
  gap: number;
  padding?: number;
  align?: "start" | "center" | "end" | "stretch";
};

export type EditableAnchor = {
  left?: boolean | number;
  right?: boolean | number;
  top?: boolean | number;
  bottom?: boolean | number;
  horizontalCenter?: boolean;
  verticalCenter?: boolean;
};

export type EditableLayerContent = {
  text?: string;
  textMode?: EditableTextMode;
  src?: string;
  /** Expression-lite template e.g. "Lot {Lot Number} — {Lot Name}" */
  expression?: string;
};

export type EditableGuide = {
  id: string;
  orientation: "horizontal" | "vertical";
  position: number;
};

export type EditableNamedState = {
  id: string;
  name: string;
  /** Layer id → partial transform/style overrides */
  overrides: Record<string, Partial<EditableLayer>>;
};

export type EditableDesignToken = {
  id: string;
  name: string;
  kind: "color" | "font" | "number" | "string";
  value: string;
};

export type EditableComponentDef = {
  id: string;
  name: string;
  /** Snapshot of layers that make up the component */
  layers: EditableLayer[];
  width: number;
  height: number;
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
  /** Phase 4 precision transform (optional) */
  scaleX?: number;
  scaleY?: number;
  anchorX?: number;
  anchorY?: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  style: EditableLayerStyle;
  content: EditableLayerContent;
  dataBinding?: EditableDataBinding | string;
  overflow: EditableOverflow;
  animations: EditableLayerAnimations;
  assetId?: string | null;
  /** Phase 3 foundations (optional, backward compatible) */
  formatters?: EditableFormatterStep[];
  visibilityCondition?: EditableVisibilityCondition | null;
  conditionalStyles?: EditableConditionalStyleRule[];
  effects?: EditableLayerEffect[];
  mask?: EditableMask | null;
  crop?: EditableImageCrop | null;
  repeater?: EditableRepeater | null;
  autoLayout?: EditableAutoLayout | null;
  anchors?: EditableAnchor | null;
  operatorEditable?: boolean;
  designerNotes?: string;
  componentId?: string | null;
  componentInstanceId?: string | null;
  /** Linked document text style (Phase 5) */
  textStyleId?: string | null;
  /** Detached instance = true when no longer linked to symbol */
  detached?: boolean;
  /** Component data context mapping (instance field → parent binding) */
  dataContextMap?: Record<string, string>;
  collapsed?: boolean;
};

export type EditableOverlaySettings = {
  titleSafe?: boolean;
  actionSafe?: boolean;
  thirds?: boolean;
  center?: boolean;
  custom?: { x: number; y: number; width: number; height: number } | null;
  grid?: boolean;
  gridSize?: number;
  rulers?: boolean;
  bindingLabels?: boolean;
};

export type EditableGraphicSchema = {
  schemaVersion: 2;
  graphicType: "schedule-ticker-editable" | string;
  width: number;
  height: number;
  background: { color?: string };
  guides: EditableGuide[];
  layers: EditableLayer[];
  /** Phase 3 document-level foundations */
  overlays?: EditableOverlaySettings;
  namedStates?: EditableNamedState[];
  activeStateId?: string | null;
  designTokens?: EditableDesignToken[];
  components?: EditableComponentDef[];
  designLocked?: boolean;
  /** Phase 5 document libraries */
  textStyles?: TextStyleDefinition[];
  operatorSections?: OperatorSection[];
  projectAssets?: ProjectAsset[];
  fontFallbacks?: Record<string, string>;
  brandKit?: ProjectBrandKit | null;
};

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
    x: 200,
    y: 200,
    width: type === "line" ? 400 : 320,
    height: type === "line" ? 4 : type === "text" ? 64 : 200,
    rotation: 0,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    style: {},
    content: {},
    overflow: { mode: "truncate" },
    animations: {},
    assetId: null,
    formatters: [],
    visibilityCondition: null,
    conditionalStyles: [],
    effects: [],
    mask: null,
    crop: null,
    repeater: null,
    autoLayout: null,
    anchors: null,
    operatorEditable: false,
    designerNotes: "",
    componentId: null,
    componentInstanceId: null,
    detached: false,
    collapsed: false,
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
    base.crop = { offsetX: 0, offsetY: 0, zoom: 1, fit: "contain" };
  } else if (type === "group") {
    base.width = 400;
    base.height = 300;
  } else if (type === "logo-placeholder") {
    base.name = "Logo Placeholder";
  } else if (type === "repeater") {
    base.name = "Repeater";
    base.repeater = { direction: "horizontal", gap: 16, maxItems: 5 };
  }
  return {
    ...base,
    ...partial,
    style: { ...base.style, ...partial?.style },
    content: { ...base.content, ...partial?.content },
    overflow: { ...base.overflow, ...partial?.overflow },
    animations: { ...base.animations, ...partial?.animations },
  };
}

export function cloneSchema(schema: EditableGraphicSchema): EditableGraphicSchema {
  return JSON.parse(JSON.stringify(schema)) as EditableGraphicSchema;
}

export function cloneLayer(layer: EditableLayer): EditableLayer {
  return JSON.parse(JSON.stringify(layer)) as EditableLayer;
}
