import type { EditableGraphicSchema, EditableLayer } from "./editable-graphic-types";
import { cloneSchema } from "./editable-graphic-types";

export type EditorHistoryFrame = {
  schema: EditableGraphicSchema;
  label: string;
};

function layerById(schema: EditableGraphicSchema, id: string): EditableLayer | undefined {
  return schema.layers.find((layer) => layer.id === id);
}

function describeLayerChange(before: EditableLayer, after: EditableLayer): string | null {
  const name = after.name || before.name || "Layer";
  if (before.x !== after.x || before.y !== after.y) {
    return `Move ${name}`;
  }
  if (before.width !== after.width || before.height !== after.height) {
    return `Resize ${name}`;
  }
  if ((before.rotation || 0) !== (after.rotation || 0)) {
    return `Rotate ${name}`;
  }
  if (before.name !== after.name) {
    return `Rename ${before.name} → ${after.name}`;
  }
  if (before.visible !== after.visible) {
    return before.visible ? `Hide ${name}` : `Show ${name}`;
  }
  if (before.locked !== after.locked) {
    return before.locked ? `Unlock ${name}` : `Lock ${name}`;
  }
  if (before.style?.color !== after.style?.color || before.style?.fill !== after.style?.fill) {
    return `Style ${name}`;
  }
  if (before.content?.text !== after.content?.text) {
    return `Edit Text ${name}`;
  }
  if (before.dataBinding !== after.dataBinding) {
    return `Bind Data ${name}`;
  }
  return null;
}

/** Infer a friendly label when none was supplied at commit time. */
export function inferHistoryLabel(
  before: EditableGraphicSchema,
  after: EditableGraphicSchema,
): string {
  if (before.layers.length !== after.layers.length) {
    const delta = after.layers.length - before.layers.length;
    if (delta > 0) return delta === 1 ? "Add Layer" : `Add ${delta} Layers`;
    return delta === -1 ? "Delete Layer" : `Delete ${Math.abs(delta)} Layers`;
  }
  const beforeIds = new Set(before.layers.map((l) => l.id));
  for (const layer of after.layers) {
    if (!beforeIds.has(layer.id)) {
      return `Add ${layer.name}`;
    }
  }
  for (const layer of before.layers) {
    const next = layerById(after, layer.id);
    if (!next) continue;
    const detail = describeLayerChange(layer, next);
    if (detail) return detail;
  }
  if (JSON.stringify(before.guides) !== JSON.stringify(after.guides)) {
    return "Edit Guides";
  }
  if (JSON.stringify(before.textStyles ?? []) !== JSON.stringify(after.textStyles ?? [])) {
    return "Edit Text Styles";
  }
  if (JSON.stringify(before.components ?? []) !== JSON.stringify(after.components ?? [])) {
    return "Edit Components";
  }
  return "Edit Document";
}

export function createHistoryFrame(
  schema: EditableGraphicSchema,
  label?: string,
  previous?: EditableGraphicSchema | null,
): EditorHistoryFrame {
  const resolved =
    label?.trim() ||
    (previous ? inferHistoryLabel(previous, schema) : "Initial State");
  return { schema: cloneSchema(schema), label: resolved };
}

export function restoreHistoryIndex(
  frames: EditorHistoryFrame[],
  current: EditableGraphicSchema,
  targetIndex: number,
): {
  history: EditorHistoryFrame[];
  future: EditorHistoryFrame[];
  schema: EditableGraphicSchema;
} {
  const clamped = Math.max(0, Math.min(frames.length, targetIndex));
  const history = frames.slice(0, clamped);
  const future = frames.slice(clamped).reverse();
  future.unshift(createHistoryFrame(current, "Current"));
  const schema =
    clamped === 0
      ? cloneSchema(frames[0]?.schema ?? current)
      : cloneSchema(history[history.length - 1]!.schema);
  return { history, future, schema };
}
