import { createLayerId, type EditableGuide, type EditableGraphicSchema } from "./editable-graphic-types";

export const RULER_THICKNESS_PX = 22;

export function rulerMajorStep(canvasLength: number): number {
  if (canvasLength <= 800) return 50;
  if (canvasLength <= 1920) return 100;
  if (canvasLength <= 3840) return 200;
  return 500;
}

export function buildRulerTicks(length: number, step: number): number[] {
  const ticks: number[] = [];
  for (let pos = 0; pos <= length; pos += step) {
    ticks.push(pos);
  }
  return ticks;
}

export function createPersistentGuide(
  orientation: "horizontal" | "vertical",
  position: number,
): EditableGuide {
  return {
    id: createLayerId("guide"),
    orientation,
    position: Math.round(position),
  };
}

export function updateGuidePosition(
  guides: EditableGuide[],
  guideId: string,
  position: number,
): EditableGuide[] {
  return guides.map((guide) =>
    guide.id === guideId ? { ...guide, position: Math.round(position) } : guide,
  );
}

export function removeGuide(guides: EditableGuide[], guideId: string): EditableGuide[] {
  return guides.filter((guide) => guide.id !== guideId);
}

export function isGuideOffCanvas(
  guide: EditableGuide,
  canvasWidth: number,
  canvasHeight: number,
  margin = 12,
): boolean {
  if (guide.orientation === "vertical") {
    return guide.position < -margin || guide.position > canvasWidth + margin;
  }
  return guide.position < -margin || guide.position > canvasHeight + margin;
}

export function guidesFromSchema(schema: EditableGraphicSchema): EditableGuide[] {
  return Array.isArray(schema.guides) ? schema.guides : [];
}

export function setSchemaGuides(
  schema: EditableGraphicSchema,
  guides: EditableGuide[],
): EditableGraphicSchema {
  return { ...schema, guides };
}
