import {
  cloneLayer,
  createLayerId,
  type EditableComponentDef,
  type EditableGraphicSchema,
  type EditableLayer,
} from "./editable-graphic-types";

export function createComponentFromSelection(
  schema: EditableGraphicSchema,
  layerIds: string[],
  name: string,
): { schema: EditableGraphicSchema; componentId: string } | null {
  if (layerIds.length === 0) return null;
  const selected = schema.layers.filter((layer) => layerIds.includes(layer.id));
  if (selected.length === 0) return null;
  const minX = Math.min(...selected.map((l) => l.x));
  const minY = Math.min(...selected.map((l) => l.y));
  const maxX = Math.max(...selected.map((l) => l.x + l.width));
  const maxY = Math.max(...selected.map((l) => l.y + l.height));
  const componentId = createLayerId("component");
  const layers = selected.map((layer) =>
    cloneLayer({
      ...layer,
      x: layer.x - minX,
      y: layer.y - minY,
    }),
  );
  const def: EditableComponentDef = {
    id: componentId,
    name: name.trim() || "Component",
    layers,
    width: maxX - minX,
    height: maxY - minY,
  };
  return {
    componentId,
    schema: {
      ...schema,
      components: [...(schema.components ?? []), def],
    },
  };
}

export function insertComponentInstance(
  schema: EditableGraphicSchema,
  componentId: string,
  at?: { x?: number; y?: number },
): { schema: EditableGraphicSchema; layerId: string } | null {
  const def = (schema.components ?? []).find((entry) => entry.id === componentId);
  if (!def) return null;
  const instanceId = createLayerId("instance");
  const x = at?.x ?? Math.round(schema.width / 2 - def.width / 2);
  const y = at?.y ?? Math.round(schema.height / 2 - def.height / 2);
  const childLayers: EditableLayer[] = def.layers.map((layer, index) => ({
    ...cloneLayer(layer),
    id: createLayerId(`${layer.type}-inst`),
    parentId: instanceId,
    x: layer.x,
    y: layer.y,
    zIndex: index,
    componentId,
    componentInstanceId: instanceId,
    detached: false,
  }));
  const maxZ = schema.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
  const instance: EditableLayer = {
    id: instanceId,
    parentId: null,
    type: "component-instance",
    name: def.name,
    x,
    y,
    width: def.width,
    height: def.height,
    rotation: 0,
    zIndex: maxZ + 1,
    visible: true,
    locked: false,
    opacity: 1,
    style: {},
    content: {},
    overflow: { mode: "truncate" },
    animations: {},
    assetId: null,
    componentId,
    componentInstanceId: instanceId,
    detached: false,
  };
  return {
    layerId: instanceId,
    schema: {
      ...schema,
      layers: [...schema.layers, instance, ...childLayers],
    },
  };
}

export function detachComponentInstance(layer: EditableLayer): EditableLayer {
  return {
    ...layer,
    detached: true,
    componentId: null,
    type: layer.type === "component-instance" ? "group" : layer.type,
  };
}
