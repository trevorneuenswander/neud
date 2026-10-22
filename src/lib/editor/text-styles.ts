import type { EditableGraphicSchema, EditableLayer } from "./editable-graphic-types";
import type { TextStyleDefinition } from "./phase4-types";
import { createLayerId } from "./editable-graphic-types";

export function createTextStyleId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `text-style-${slug || "new"}-${Date.now().toString(36)}`;
}

export function createTextStyleFromLayer(layer: EditableLayer, name: string): TextStyleDefinition {
  return {
    id: createTextStyleId(name),
    name,
    fontFamily: layer.style?.fontFamily ?? "Helvetica Neue, Arial, sans-serif",
    fontSize: layer.style?.fontSize ?? 32,
    fontWeight: layer.style?.fontWeight ?? 400,
    lineHeight: layer.style?.lineHeight ?? 1.28,
    letterSpacing: 0,
    color: layer.style?.color ?? "#f8f8fa",
  };
}

export function applyTextStyleToLayer(
  layer: EditableLayer,
  style: TextStyleDefinition,
  linked: boolean,
): EditableLayer {
  return {
    ...layer,
    textStyleId: linked ? style.id : null,
    style: {
      ...layer.style,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      color: style.color,
    },
  };
}

export function syncLinkedTextLayers(
  schema: EditableGraphicSchema,
  styleId: string,
  style: TextStyleDefinition,
): EditableGraphicSchema {
  return {
    ...schema,
    textStyles: (schema.textStyles ?? []).map((entry) =>
      entry.id === styleId ? style : entry,
    ),
    layers: schema.layers.map((layer) =>
      layer.textStyleId === styleId ? applyTextStyleToLayer(layer, style, true) : layer,
    ),
  };
}

export function detachTextStyle(layer: EditableLayer): EditableLayer {
  return { ...layer, textStyleId: null };
}
