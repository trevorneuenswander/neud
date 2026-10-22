import { DisplayStackFitClient } from "@/components/displays/DisplayStackFitClient";
import {
  parseDisplayStackFitLayers,
  parseDisplayStackFitSurface,
} from "@/lib/displays/display-stack-fit";
import { parseDisplayWindowFitDimensions } from "@/lib/displays/display-window-fit";

type DisplayStackFitPageProps = {
  searchParams: Promise<{
    projectId?: string;
    stackId?: string;
    layers?: string;
    width?: string;
    height?: string;
    outputWidth?: string;
    outputHeight?: string;
    surface?: string;
    cursor?: string;
  }>;
};

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default async function DisplayStackFitPage({ searchParams }: DisplayStackFitPageProps) {
  const query = await searchParams;
  const projectId = typeof query.projectId === "string" ? query.projectId.trim() : "";
  const layers = parseDisplayStackFitLayers(query.layers);
  const { displayWidth, displayHeight } = parseDisplayWindowFitDimensions(query.width, query.height);
  const surface = parseDisplayStackFitSurface(query.surface);
  const outputWidth = parsePositiveInt(query.outputWidth);
  const outputHeight = parsePositiveInt(query.outputHeight);

  if (!projectId || layers.length === 0) {
    return null;
  }

  return (
    <DisplayStackFitClient
      projectId={projectId}
      layers={layers}
      displayWidth={displayWidth}
      displayHeight={displayHeight}
      outputWidth={outputWidth}
      outputHeight={outputHeight}
      surface={surface}
      hideCursor={query.cursor === "none"}
    />
  );
}
