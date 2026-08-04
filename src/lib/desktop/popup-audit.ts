/**
 * Inventory of NEUD popup replacements.
 * Native dialogs remain only where the renderer is unavailable.
 */
export const NEUD_POPUP_AUDIT = [
  {
    location: "desktop/src/main.ts",
    previousImplementation: "dialog.showMessageBox(EXIT_CONFIRM_DIALOG)",
    popupPurpose: "Exit while scraper running",
    replacement: "NeudAppDialogHost + neud:app:closeRequested IPC",
    nativeExceptionReason: null,
  },
  {
    location: "desktop/src/main.ts",
    previousImplementation: "dialog.showErrorBox",
    popupPurpose: "Fatal startup failure",
    replacement: "dialog.showErrorBox with NEUD title",
    nativeExceptionReason: "Renderer unavailable before UI initialization",
  },
  {
    location: "src/components/bag-graphics/BagControllerClient.tsx",
    previousImplementation: "window.confirm",
    popupPurpose: "Clear all downloads",
    replacement: "ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/bag-graphics/LotPhotoThumbnails.tsx",
    previousImplementation: "window.confirm / window.alert",
    popupPurpose: "Remove photo / import error",
    replacement: "ConfirmDialog / NeudAlertModal",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/projects/DeleteProjectSection.tsx",
    previousImplementation: "window.confirm",
    popupPurpose: "Delete project",
    replacement: "ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/data-engines/webpage-scraper/BagScraperSourcesForm.tsx",
    previousImplementation: "window.confirm",
    popupPurpose: "Remove scraper source",
    replacement: "ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/data-engines/webpage-scraper/SourceList.tsx",
    previousImplementation: "window.confirm",
    popupPurpose: "Remove scraper source",
    replacement: "ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/data-engines/webpage-scraper/GenericScraperConfig.tsx",
    previousImplementation: "window.confirm",
    popupPurpose: "Convert BAG adapter",
    replacement: "ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/developer-tools/DisplayDeveloperActions.tsx",
    previousImplementation: "window.prompt / window.confirm",
    popupPurpose: "Duplicate / archive / delete display",
    replacement: "DuplicateDisplayModal / ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "src/components/developer-tools/DisplayDeveloperTools.tsx",
    previousImplementation: "window.prompt / window.confirm",
    popupPurpose: "Duplicate / archive display",
    replacement: "DuplicateDisplayModal / ConfirmDialog",
    nativeExceptionReason: null,
  },
  {
    location: "desktop/src/ipc/offline-auction.ts",
    previousImplementation: "dialog.showOpenDialog",
    popupPurpose: "Add lot photos file picker",
    replacement: "dialog.showOpenDialog with NEUD title",
    nativeExceptionReason: "OS file picker required for multi-select image import",
  },
] as const;
