/**
 * New Display templates foundation.
 * Blank is fully working; others are simple starter schemas.
 */

import {
  createEmptyLayer,
  createLayerId,
  type EditableGraphicSchema,
  type EditableLayer,
} from "./editable-graphic-types";

export type DisplayTemplateId =
  | "blank"
  | "lower-third"
  | "ticker"
  | "pylon"
  | "full-screen"
  | "bug"
  | "leaderboard"
  | "scoreboard";

export type DisplayTemplate = {
  id: DisplayTemplateId;
  name: string;
  description: string;
  width: number;
  height: number;
};

export const DISPLAY_TEMPLATES: DisplayTemplate[] = [
  { id: "blank", name: "Blank", description: "Empty canvas", width: 1920, height: 1080 },
  { id: "lower-third", name: "Lower Third", description: "Name / title bar", width: 1920, height: 1080 },
  { id: "ticker", name: "Ticker", description: "Horizontal ticker band", width: 3840, height: 2160 },
  { id: "pylon", name: "Pylon", description: "Vertical info stack", width: 1080, height: 1920 },
  { id: "full-screen", name: "Full Screen", description: "Full-bleed graphic", width: 1920, height: 1080 },
  { id: "bug", name: "Bug", description: "Corner logo / bug", width: 1920, height: 1080 },
  { id: "leaderboard", name: "Leaderboard", description: "Ranked list starter", width: 1920, height: 1080 },
  { id: "scoreboard", name: "Scoreboard", description: "Score panel starter", width: 1920, height: 1080 },
];

function baseSchema(
  width: number,
  height: number,
  layers: EditableLayer[],
  graphicType: string,
): EditableGraphicSchema {
  return {
    schemaVersion: 2,
    graphicType,
    width,
    height,
    background: { color: "transparent" },
    guides: [],
    layers: layers.map((layer, index) => ({ ...layer, zIndex: index })),
    overlays: { titleSafe: false, actionSafe: false, thirds: false, center: true },
    namedStates: [{ id: "default", name: "Default", overrides: {} }],
    activeStateId: "default",
    designTokens: [],
    components: [],
    designLocked: false,
  };
}

export function createTemplateSchema(templateId: DisplayTemplateId): EditableGraphicSchema {
  const meta = DISPLAY_TEMPLATES.find((t) => t.id === templateId) ?? DISPLAY_TEMPLATES[0]!;
  switch (templateId) {
    case "blank":
      return baseSchema(meta.width, meta.height, [], "blank");
    case "lower-third":
      return baseSchema(
        meta.width,
        meta.height,
        [
          createEmptyLayer("rect", {
            id: createLayerId("bar"),
            name: "Bar",
            x: 80,
            y: meta.height - 220,
            width: meta.width - 160,
            height: 140,
            style: { fill: "#121212" },
          }),
          createEmptyLayer("text", {
            id: createLayerId("name"),
            name: "Name",
            x: 120,
            y: meta.height - 200,
            width: 800,
            height: 56,
            content: { text: "Name", textMode: "static" },
            style: { color: "#ffffff", fontSize: 48, fontWeight: 700 },
            operatorEditable: true,
          }),
          createEmptyLayer("text", {
            id: createLayerId("title"),
            name: "Title",
            x: 120,
            y: meta.height - 140,
            width: 800,
            height: 40,
            content: { text: "Title", textMode: "static" },
            style: { color: "#cccccc", fontSize: 28 },
            operatorEditable: true,
          }),
        ],
        "lower-third",
      );
    case "ticker":
      return baseSchema(
        meta.width,
        meta.height,
        [
          createEmptyLayer("rect", {
            id: createLayerId("band"),
            name: "Ticker Band",
            x: 0,
            y: meta.height - 240,
            width: meta.width,
            height: 240,
            style: { fill: "#0a0a0a" },
          }),
          createEmptyLayer("text", {
            id: createLayerId("ticker-text"),
            name: "Ticker Text",
            x: 80,
            y: meta.height - 180,
            width: meta.width - 160,
            height: 120,
            content: { text: "Ticker", textMode: "data" },
            dataBinding: "now.title",
            style: { color: "#ffffff", fontSize: 72 },
          }),
        ],
        "schedule-ticker-editable",
      );
    case "bug":
      return baseSchema(
        meta.width,
        meta.height,
        [
          createEmptyLayer("rect", {
            id: createLayerId("bug"),
            name: "Bug",
            x: meta.width - 220,
            y: 40,
            width: 160,
            height: 160,
            style: { fill: "#E31C23" },
          }),
        ],
        "bug",
      );
    case "pylon":
    case "full-screen":
    case "leaderboard":
    case "scoreboard":
    default:
      return baseSchema(
        meta.width,
        meta.height,
        [
          createEmptyLayer("text", {
            id: createLayerId("label"),
            name: meta.name,
            x: 80,
            y: 80,
            width: meta.width - 160,
            height: 80,
            content: { text: meta.name, textMode: "static" },
            style: { color: "#ffffff", fontSize: 64, fontWeight: 700 },
          }),
        ],
        templateId,
      );
  }
}
