/**
 * Graphic Editor Phase 4 — extended foundations (types only).
 */

import type {
  EditableConditionOperator,
  EditableGraphicSchema,
  EditableLayerStyle,
} from "./editable-graphic-types";
import type { ProjectBrandKit } from "./brand-kit";

export type TextStyleDefinition = {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
};

export type TextBoxMode = "point" | "area";

export type TextAutoSize = "fixed" | "autoWidth" | "autoHeight" | "autoBoth";

export type InlineTextToken =
  | { kind: "text"; value: string }
  | { kind: "binding"; binding: string; label?: string };

export type ScheduleSampleRow = {
  title?: string;
  description?: string;
};

export type ScheduleSampleData = {
  now?: ScheduleSampleRow | null;
  next?: ScheduleSampleRow | null;
  later?: ScheduleSampleRow | null;
};

export type SampleScenario = {
  id: string;
  name: string;
  schedule: ScheduleSampleData;
};

export type ConditionalRuleAction =
  | { type: "show" }
  | { type: "hide" }
  | {
      type: "style";
      style: Partial<Pick<EditableLayerStyle, "color" | "fill">> & { opacity?: number };
    };

/** Friendly declarative rule for operators (maps to layer visibility/style evaluators). */
export type ConditionalRule = {
  id: string;
  label?: string;
  binding: string;
  operator: EditableConditionOperator;
  value?: string;
  action: ConditionalRuleAction;
};

export type OperatorControlValidation = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
};

export type OperatorControl = {
  id: string;
  label: string;
  /** Layer id or binding path the control affects */
  targetLayerId?: string;
  targetBinding?: string;
  controlType: "text" | "number" | "toggle" | "select" | "color";
  options?: { value: string; label: string }[];
  validation?: OperatorControlValidation;
  helpText?: string;
};

export type OperatorSection = {
  id: string;
  title: string;
  description?: string;
  controls: OperatorControl[];
  collapsed?: boolean;
};

export type ComponentExposure = {
  /** Layer ids inside a component that operators may override */
  layerIds: string[];
  /** Bindings exposed on instances */
  bindings?: string[];
};

export type ComponentVariant = {
  id: string;
  name: string;
  /** Partial layer property overrides keyed by layer id */
  overrides: Record<string, Partial<{ visible: boolean; opacity: number; style: EditableLayerStyle }>>;
};

export type PerformanceCost = "low" | "medium" | "high";

export type DraftStatus = "dirty" | "saved" | "published";

export type NeudGraphicManifest = {
  formatVersion: "1";
  displayName: string;
  createdAt: string;
  updatedAt: string;
  graphicType: string;
  width: number;
  height: number;
  sampleScenarioIds?: string[];
  brandKitIncluded?: boolean;
};

export type NeudGraphicPackageContents = {
  manifest: NeudGraphicManifest;
  schema: EditableGraphicSchema;
  assets: [];
  sampleData: Record<string, ScheduleSampleData>;
  brandKit?: ProjectBrandKit | null;
};

export type GraphicBudgetLevel = "good" | "moderate" | "heavy";

export type GraphicBudgetEstimate = {
  level: GraphicBudgetLevel;
  contributors: { layerId: string; name: string; cost: PerformanceCost }[];
};
