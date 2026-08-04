import { computeDisplayViewerScale } from "@/lib/displays/display-viewer-scale";

export type DisplayViewerMeasurements = {
  viewportWidth: number;
  viewportHeight: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
  scaledWidth: number;
  scaledHeight: number;
};

export function buildDisplayViewerMeasurements(input: {
  viewportWidth: number;
  viewportHeight: number;
  displayWidth: number;
  displayHeight: number;
}): DisplayViewerMeasurements {
  const scale = computeDisplayViewerScale(
    input.viewportWidth,
    input.viewportHeight,
    input.displayWidth,
    input.displayHeight,
  );

  return {
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    displayWidth: input.displayWidth,
    displayHeight: input.displayHeight,
    scale,
    scaledWidth: input.displayWidth * scale,
    scaledHeight: input.displayHeight * scale,
  };
}
