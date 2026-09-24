const PROJECT_SCROLL_SELECTOR = ".project-layout-frame";
const SCROLL_WATCH_MS = 200;

export function getProjectScrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.querySelector(PROJECT_SCROLL_SELECTOR);
}

function restoreScrollTop(container: HTMLElement, scrollTop: number) {
  if (Math.abs(container.scrollTop - scrollTop) > 2) {
    container.scrollTop = scrollTop;
  }
}

export function preserveProjectScrollPosition(runUpdate: () => void) {
  const container = getProjectScrollContainer();
  const scrollTop = container?.scrollTop ?? 0;
  const containerIdentity = container;
  runUpdate();
  if (!container || !containerIdentity) {
    return;
  }

  const startedAt = performance.now();
  const watch = () => {
    const activeContainer = getProjectScrollContainer();
    if (!activeContainer || activeContainer !== containerIdentity) {
      return;
    }
    if (scrollTop > 40 && activeContainer.scrollTop < 8) {
      activeContainer.scrollTop = scrollTop;
    } else {
      restoreScrollTop(activeContainer, scrollTop);
    }
    if (performance.now() - startedAt < SCROLL_WATCH_MS) {
      requestAnimationFrame(watch);
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(watch);
  });
}
