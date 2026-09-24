export type ControllerScrollProbe = {
  stage: string;
  scrollContainerSameNode: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  pathname: string;
  search: string;
  activeElementTag: string | null;
  controllerMountId: string;
  selectedLot: string | null;
  photoPanelHeight: number | null;
};

const CONTROLLER_MOUNT_ID = `controller-${Math.random().toString(36).slice(2, 10)}`;

let debugEnabled: boolean | null = null;
let scrollContainerRef: HTMLElement | null = null;

function isDebugEnabled() {
  if (debugEnabled !== null) {
    return debugEnabled;
  }
  if (typeof window === "undefined") {
    debugEnabled = false;
    return false;
  }
  try {
    debugEnabled = window.localStorage.getItem("NEUD_DEBUG_CONTROLLER_SCROLL") === "1";
  } catch {
    debugEnabled = false;
  }
  return debugEnabled;
}

function readPhotoPanelHeight(): number | null {
  if (typeof document === "undefined") {
    return null;
  }
  const node = document.querySelector("[data-neud-controller-photo-panel]");
  return node instanceof HTMLElement ? node.offsetHeight : null;
}

export function probeControllerScroll(
  stage: string,
  selectedLot: string | null,
): ControllerScrollProbe {
  const container =
    scrollContainerRef ?? document.querySelector(".project-layout-frame");
  if (container instanceof HTMLElement) {
    scrollContainerRef = container;
  }
  const probe: ControllerScrollProbe = {
    stage,
    scrollContainerSameNode: Boolean(
      container && scrollContainerRef && container === scrollContainerRef,
    ),
    scrollTop: container instanceof HTMLElement ? container.scrollTop : 0,
    scrollHeight: container instanceof HTMLElement ? container.scrollHeight : 0,
    clientHeight: container instanceof HTMLElement ? container.clientHeight : 0,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    search: typeof window !== "undefined" ? window.location.search : "",
    activeElementTag:
      typeof document !== "undefined" && document.activeElement
        ? document.activeElement.tagName.toLowerCase()
        : null,
    controllerMountId: CONTROLLER_MOUNT_ID,
    selectedLot,
    photoPanelHeight: readPhotoPanelHeight(),
  };
  if (isDebugEnabled()) {
    console.debug("[ControllerScroll]", probe);
  }
  return probe;
}

export function getControllerMountId() {
  return CONTROLLER_MOUNT_ID;
}
