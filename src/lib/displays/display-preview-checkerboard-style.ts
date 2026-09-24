/** Management preview only — not used in Local URL, fullscreen, or Online Viewer output. */
export const MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE = {
  backgroundColor: "#d9d9d9",
  backgroundImage:
    "linear-gradient(45deg, #cfcfcf 25%, transparent 25%), linear-gradient(-45deg, #cfcfcf 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cfcfcf 75%), linear-gradient(-45deg, transparent 75%, #cfcfcf 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
} as const;
