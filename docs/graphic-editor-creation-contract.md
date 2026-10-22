# Graphic Editor — Creation Contract

Future **Create Display** entry paths share one editable document model.

## Paths

| Path | Purpose |
| --- | --- |
| **Import HTML** | Bring existing markup/assets into the project; conversion produces or attaches an `EditableGraphicSchema` when possible. |
| **Graphic Editor** | Author layers, bindings, and styles directly in NEUD. |
| **AI Assistant** | *(Not implemented)* Generates a display from a prompt; output must be schema, not raw HTML. |

## Canonical document

All paths that open in the Graphic Editor must read and write **`EditableGraphicSchema`** (v2). Arbitrary HTML is not the source of truth for editor round-trips.

## AI Assistant constraint

When AI generation is added, it **must** emit valid `EditableGraphicSchema` (plus optional `.neudgraphic` package metadata). The Graphic Editor opens that schema like any hand-authored or imported display. AI must not ship standalone HTML as the only editable artifact.

## Package format

Portable shares use **`.neudgraphic`** JSON (`NeudGraphicManifest` version `"1"`, schema, optional sample scenarios and brand kit). See `src/lib/editor/neudgraphic-package.ts`.
