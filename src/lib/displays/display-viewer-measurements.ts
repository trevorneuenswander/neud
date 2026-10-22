import {
  computeDisplayViewerContainScale,
  computeDisplayViewerScale,
  computeDisplayViewerStretchScale,
} from "@/lib/displays/display-viewer-scale";

export type DisplayViewerFillMode = "contain" | "stretch";

export type DisplayViewerMeasurements = {
  viewportWidth: number;
  viewportHeight: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaledWidth: number;
  scaledHeight: number;
  fillMode: DisplayViewerFillMode;
};

export function buildDisplayViewerMeasurements(input: {
  viewportWidth: number;
  viewportHeight: number;
  displayWidth: number;
  displayHeight: number;
  /** When true, scale to fit viewport even if that upscales beyond native size. */
  allowUpscale?: boolean;
  /**
   * contain (default): letterbox-safe uniform scale.
   * stretch: fill viewport edge-to-edge (program output / stack).
   */
  fillMode?: DisplayViewerFillMode;
}): DisplayViewerMeasurements {
  const fillMode = input.fillMode ?? "contain";

  if (fillMode === "stretch") {
    const { scaleX, scaleY } = computeDisplayViewerStretchScale(
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
      scale: Math.min(scaleX, scaleY),
      scaleX,
      scaleY,
      scaledWidth: input.viewportWidth,
      scaledHeight: input.viewportHeight,
      fillMode,
    };
  }

  const scale = input.allowUpscale
    ? computeDisplayViewerContainScale(
        input.viewportWidth,
        input.viewportHeight,
        input.displayWidth,
        input.displayHeight,
      )
    : computeDisplayViewerScale(
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
    scaleX: scale,
    scaleY: scale,
    scaledWidth: input.displayWidth * scale,
    scaledHeight: input.displayHeight * scale,
    fillMode,
  };
}
