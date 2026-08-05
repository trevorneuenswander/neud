/** Shared worker lifecycle actual_state for heartbeats and status patches. */
let actualState = "starting";

export function getLifecycleActualState() {
  return actualState;
}

export function setLifecycleActualState(state) {
  actualState = state;
}
