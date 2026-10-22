import { screen } from "electron";
import { mapComputerDisplays, type ComputerDisplaySource, type OutputDevice } from "./output-engine-core";

function toSource(display: Electron.Display): ComputerDisplaySource {
  return {
    id: display.id,
    label: display.label || `Display ${display.id}`,
    bounds: display.bounds,
    workArea: display.workArea,
    size: display.size,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    internal: display.internal,
  };
}

export function discoverElectronDisplays(): OutputDevice[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return mapComputerDisplays(screen.getAllDisplays().map(toSource), primaryId);
}

export function watchElectronDisplays(onChange: () => void): () => void {
  const handler = () => onChange();
  screen.on("display-added", handler);
  screen.on("display-removed", handler);
  screen.on("display-metrics-changed", handler);
  return () => {
    screen.removeListener("display-added", handler);
    screen.removeListener("display-removed", handler);
    screen.removeListener("display-metrics-changed", handler);
  };
}
