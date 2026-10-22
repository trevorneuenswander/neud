"use client";

import { useMemo, useState } from "react";
import type { EditableGraphicSchema, EditableLayer } from "@/lib/editor/editable-graphic-types";
import type { ProjectBrandKit } from "@/lib/editor/brand-kit";
import {
  analyzeFonts,
  COMMON_EDITOR_FONTS,
  resolveFontFamily,
} from "@/lib/editor/font-management";
import {
  createComponentFromSelection,
  detachComponentInstance,
  insertComponentInstance,
} from "@/lib/editor/editor-components";
import {
  applyTextStyleToLayer,
  createTextStyleFromLayer,
  detachTextStyle,
  syncLinkedTextLayers,
} from "@/lib/editor/text-styles";
import {
  defaultOperatorValues,
  validateOperatorControl,
  type OperatorPreviewValues,
} from "@/lib/editor/operator-controls";
import type { OperatorSection, TextStyleDefinition } from "@/lib/editor/phase4-types";
import { ColorField } from "@/components/editor/ColorField";
import { createLayerId } from "@/lib/editor/editable-graphic-types";

type EditorDesignPanelProps = {
  schema: EditableGraphicSchema;
  selected: EditableLayer | null;
  selectedIds: string[];
  brandKit: ProjectBrandKit;
  onBrandKitChange: (kit: ProjectBrandKit) => void;
  onSchemaChange: (schema: EditableGraphicSchema, label?: string) => void;
};

export function EditorDesignPanel({
  schema,
  selected,
  selectedIds,
  brandKit,
  onBrandKitChange,
  onSchemaChange,
}: EditorDesignPanelProps) {
  const [operatorValues, setOperatorValues] = useState<OperatorPreviewValues>(() =>
    defaultOperatorValues(schema.operatorSections ?? []),
  );
  const [componentName, setComponentName] = useState("Component");
  const [newStyleName, setNewStyleName] = useState("Body");

  const fontUsage = useMemo(
    () =>
      analyzeFonts(
        { ...schema, brandKit, fontFallbacks: schema.fontFallbacks ?? {} },
        COMMON_EDITOR_FONTS,
        schema.fontFallbacks ?? {},
      ),
    [schema, brandKit],
  );

  function updateTextStyles(styles: TextStyleDefinition[], label?: string) {
    onSchemaChange({ ...schema, textStyles: styles, brandKit }, label);
  }

  function updateOperatorSections(sections: OperatorSection[]) {
    onSchemaChange({ ...schema, operatorSections: sections, brandKit }, "Edit Operator Controls");
    setOperatorValues(defaultOperatorValues(sections));
  }

  return (
    <div className="space-y-3 text-xs">
      <section className="space-y-2 rounded border border-neutral-800 p-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Brand Kit
        </h3>
        <div className="space-y-1">
          {brandKit.colors.map((color) => (
            <div key={color.id} className="flex items-center gap-2">
              <input
                type="color"
                value={color.value.startsWith("#") ? color.value : "#ffffff"}
                onChange={(event) =>
                  onBrandKitChange({
                    ...brandKit,
                    colors: brandKit.colors.map((entry) =>
                      entry.id === color.id ? { ...entry, value: event.target.value } : entry,
                    ),
                  })
                }
              />
              <input
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5"
                value={color.name}
                onChange={(event) =>
                  onBrandKitChange({
                    ...brandKit,
                    colors: brandKit.colors.map((entry) =>
                      entry.id === color.id ? { ...entry, name: event.target.value } : entry,
                    ),
                  })
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5"
            onClick={() =>
              onBrandKitChange({
                ...brandKit,
                colors: [
                  ...brandKit.colors,
                  {
                    id: createLayerId("color"),
                    name: "New Color",
                    value: "#ffffff",
                  },
                ],
              })
            }
          >
            Add Color
          </button>
        </div>
        <div className="space-y-1 border-t border-neutral-800 pt-2">
          <div className="text-[10px] text-neutral-500">Brand fonts</div>
          {brandKit.fonts.map((font) => (
            <input
              key={font.id}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
              value={font.family}
              onChange={(event) =>
                onBrandKitChange({
                  ...brandKit,
                  fonts: brandKit.fonts.map((entry) =>
                    entry.id === font.id ? { ...entry, family: event.target.value } : entry,
                  ),
                })
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded border border-neutral-800 p-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Text Styles
        </h3>
        <div className="flex gap-1">
          <input
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
            value={newStyleName}
            onChange={(event) => setNewStyleName(event.target.value)}
            placeholder="Style name"
          />
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5"
            disabled={!selected || selected.type !== "text"}
            onClick={() => {
              if (!selected || selected.type !== "text") return;
              const style = createTextStyleFromLayer(selected, newStyleName);
              updateTextStyles([...(schema.textStyles ?? []), style], `New Text Style ${style.name}`);
            }}
          >
            New from Selection
          </button>
        </div>
        <ul className="space-y-1">
          {(schema.textStyles ?? []).map((style) => (
            <li key={style.id} className="rounded border border-neutral-800 p-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5"
                  value={style.name}
                  onChange={(event) => {
                    const updated = { ...style, name: event.target.value };
                    const nextStyles = (schema.textStyles ?? []).map((entry) =>
                      entry.id === style.id ? updated : entry,
                    );
                    onSchemaChange(
                      syncLinkedTextLayers({ ...schema, textStyles: nextStyles }, style.id, updated),
                      "Edit Text Style",
                    );
                  }}
                />
                <button
                  type="button"
                  className="rounded border border-neutral-700 px-1.5 py-0.5"
                  disabled={!selected || selected.type !== "text"}
                  onClick={() => {
                    if (!selected || selected.type !== "text") return;
                    onSchemaChange(
                      {
                        ...schema,
                        layers: schema.layers.map((layer) =>
                          layer.id === selected.id
                            ? applyTextStyleToLayer(layer, style, true)
                            : layer,
                        ),
                      },
                      `Apply Style ${style.name}`,
                    );
                  }}
                >
                  Apply
                </button>
              </div>
              {selected?.textStyleId === style.id ? (
                <button
                  type="button"
                  className="mt-1 text-[10px] text-amber-300 underline"
                  onClick={() => {
                    if (!selected) return;
                    onSchemaChange(
                      {
                        ...schema,
                        layers: schema.layers.map((layer) =>
                          layer.id === selected.id ? detachTextStyle(layer) : layer,
                        ),
                      },
                      "Detach Style",
                    );
                  }}
                >
                  Detach Style
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded border border-neutral-800 p-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Components
        </h3>
        <div className="flex gap-1">
          <input
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
            value={componentName}
            onChange={(event) => setComponentName(event.target.value)}
          />
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5"
            disabled={selectedIds.length === 0}
            onClick={() => {
              const result = createComponentFromSelection(schema, selectedIds, componentName);
              if (!result) return;
              onSchemaChange(result.schema, `Create Component ${componentName}`);
            }}
          >
            Create
          </button>
        </div>
        <ul className="space-y-1">
          {(schema.components ?? []).map((component) => (
            <li key={component.id} className="flex items-center justify-between gap-2">
              <span>{component.name}</span>
              <button
                type="button"
                className="rounded border border-neutral-700 px-1.5 py-0.5"
                onClick={() => {
                  const result = insertComponentInstance(schema, component.id);
                  if (!result) return;
                  onSchemaChange(result.schema, `Insert ${component.name}`);
                }}
              >
                Insert
              </button>
            </li>
          ))}
        </ul>
        {selected?.type === "component-instance" && !selected.detached ? (
          <button
            type="button"
            className="text-[10px] text-amber-300 underline"
            onClick={() =>
              onSchemaChange(
                {
                  ...schema,
                  layers: schema.layers.map((layer) =>
                    layer.id === selected.id ? detachComponentInstance(layer) : layer,
                  ),
                },
                "Detach Instance",
              )
            }
          >
            Detach Instance
          </button>
        ) : null}
      </section>

      <section className="space-y-2 rounded border border-neutral-800 p-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Fonts
        </h3>
        <ul className="space-y-1">
          {fontUsage.map((entry) => {
            const resolved = resolveFontFamily(
              entry.family,
              schema.fontFallbacks ?? {},
              COMMON_EDITOR_FONTS,
            );
            return (
              <li key={entry.family} className="rounded border border-neutral-800 p-2">
                <div className="flex items-center justify-between">
                  <span style={{ fontFamily: resolved.css }}>{entry.family}</span>
                  {entry.missing ? (
                    <span className="text-[10px] text-amber-300">Missing</span>
                  ) : (
                    <span className="text-[10px] text-emerald-400">Available</span>
                  )}
                </div>
                {entry.missing ? (
                  <select
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    value={entry.fallback ?? ""}
                    onChange={(event) => {
                      const fallback = event.target.value;
                      onSchemaChange(
                        {
                          ...schema,
                          fontFallbacks: {
                            ...(schema.fontFallbacks ?? {}),
                            [entry.family]: fallback,
                          },
                        },
                        `Font Fallback ${entry.family}`,
                      );
                    }}
                  >
                    <option value="">Choose fallback…</option>
                    {COMMON_EDITOR_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                ) : null}
                {resolved.usedFallback ? (
                  <p className="mt-1 text-[10px] text-amber-200">
                    Preview uses fallback: {resolved.usedFallback}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2 rounded border border-neutral-800 p-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Operator Preview
        </h3>
        <button
          type="button"
          className="rounded border border-neutral-700 px-2 py-0.5"
          onClick={() => {
            if (!selected) return;
            const section: OperatorSection = {
              id: createLayerId("op-section"),
              title: selected.name,
              controls: [
                {
                  id: createLayerId("op-control"),
                  label: `${selected.name} visibility`,
                  targetLayerId: selected.id,
                  controlType: "toggle",
                },
              ],
            };
            updateOperatorSections([...(schema.operatorSections ?? []), section]);
          }}
        >
          Expose Selected Layer
        </button>
        {(schema.operatorSections ?? []).map((section) => (
          <div key={section.id} className="rounded border border-neutral-800 p-2">
            <div className="font-medium">{section.title}</div>
            {section.controls.map((control) => {
              const value = operatorValues[control.id];
              const error = validateOperatorControl(control, value ?? "");
              return (
                <label key={control.id} className="mt-1 block">
                  {control.label}
                  {control.controlType === "toggle" ? (
                    <input
                      type="checkbox"
                      className="ml-2"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        setOperatorValues((current) => ({
                          ...current,
                          [control.id]: event.target.checked,
                        }))
                      }
                    />
                  ) : control.controlType === "number" ? (
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={typeof value === "number" ? value : 0}
                      onChange={(event) =>
                        setOperatorValues((current) => ({
                          ...current,
                          [control.id]: Number(event.target.value),
                        }))
                      }
                    />
                  ) : control.controlType === "color" ? (
                    <ColorField
                      label=""
                      value={typeof value === "string" ? value : "#ffffff"}
                      brandColors={brandKit.colors}
                      onChange={(color) =>
                        setOperatorValues((current) => ({ ...current, [control.id]: color }))
                      }
                    />
                  ) : control.controlType === "select" ? (
                    <select
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        setOperatorValues((current) => ({
                          ...current,
                          [control.id]: event.target.value,
                        }))
                      }
                    >
                      {(control.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        setOperatorValues((current) => ({
                          ...current,
                          [control.id]: event.target.value,
                        }))
                      }
                    />
                  )}
                  {error ? <span className="text-[10px] text-red-300">{error}</span> : null}
                </label>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
