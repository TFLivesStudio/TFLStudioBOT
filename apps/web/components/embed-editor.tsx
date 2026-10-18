"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { visualSchema } from "@tfl/shared";
import type { VisualPayload } from "@tfl/shared";
export function EmbedEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const parsed = visualSchema.safeParse(value);
  // Incomplete editor state is deliberately retained until the shared schema validates submission.
  const visual =
    value && typeof value === "object" && "embeds" in value
      ? (value as VisualPayload)
      : { embeds: [] };
  const [active, setActive] = useState(0);
  const embed = visual.embeds[active];
  function patch(change: Record<string, unknown>) {
    onChange({
      embeds: visual.embeds.map((e, i) =>
        i === active ? { ...e, ...change } : e,
      ),
    });
  }
  return (
    <div className="embed-editor">
      <div className="toolbar">
        <strong>Constructor de embeds</strong>
        <button
          type="button"
          className="outline"
          disabled={visual.embeds.length >= 10}
          onClick={() => {
            onChange({
              embeds: [
                ...visual.embeds,
                { title: "Nuevo embed", color: 3697061, fields: [] },
              ],
            });
            setActive(visual.embeds.length);
          }}
        >
          <Plus size={14} /> Añadir embed
        </button>
      </div>
      <div className="tabs">
        {visual.embeds.map((_, i) => (
          <button
            type="button"
            key={i}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            Embed {i + 1}
          </button>
        ))}
      </div>
      {embed && (
        <>
          <div className="field-grid">
            {(
              [
                "title",
                "description",
                "image",
                "thumbnail",
                "url",
                "footer",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    title: "Título del embed",
                    description: "Descripción",
                    image: "Imagen HTTPS",
                    thumbnail: "Miniatura HTTPS",
                    url: "Enlace HTTPS",
                    footer: "Pie de página",
                  }[key]
                }
                {key === "description" ? (
                  <textarea
                    value={embed[key] ?? ""}
                    onChange={(e) =>
                      patch({ [key]: e.target.value || undefined })
                    }
                  />
                ) : (
                  <input
                    value={embed[key] ?? ""}
                    onChange={(e) =>
                      patch({ [key]: e.target.value || undefined })
                    }
                  />
                )}
              </label>
            ))}
            <label>
              Color
              <input
                type="color"
                value={
                  "#" + (embed.color ?? 3697061).toString(16).padStart(6, "0")
                }
                onChange={(e) =>
                  patch({ color: parseInt(e.target.value.slice(1), 16) })
                }
              />
            </label>
            <label>
              Autor
              <input
                value={embed.author?.name ?? ""}
                onChange={(e) =>
                  patch({
                    author: e.target.value
                      ? { ...embed.author, name: e.target.value }
                      : undefined,
                  })
                }
              />
            </label>
          </div>
          <button
            type="button"
            className="outline"
            disabled={(embed.fields?.length ?? 0) >= 25}
            onClick={() =>
              patch({
                fields: [
                  ...(embed.fields ?? []),
                  { name: "Campo", value: "Contenido", inline: false },
                ],
              })
            }
          >
            Añadir campo
          </button>
          {(embed.fields ?? []).map((field, i) => (
            <div className="embed-field" key={i}>
              <label>
                Nombre
                <input
                  value={field.name}
                  onChange={(e) =>
                    patch({
                      fields: embed.fields.map((f, j) =>
                        i === j ? { ...f, name: e.target.value } : f,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Valor
                <input
                  value={field.value}
                  onChange={(e) =>
                    patch({
                      fields: embed.fields.map((f, j) =>
                        i === j ? { ...f, value: e.target.value } : f,
                      ),
                    })
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={field.inline}
                  onChange={(e) =>
                    patch({
                      fields: embed.fields.map((f, j) =>
                        i === j ? { ...f, inline: e.target.checked } : f,
                      ),
                    })
                  }
                />
                En línea
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label="Eliminar campo"
                onClick={() =>
                  patch({ fields: embed.fields.filter((_, j) => i !== j) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="destructive"
            onClick={() => {
              onChange({
                embeds: visual.embeds.filter((_, i) => i !== active),
              });
              setActive(0);
            }}
          >
            Eliminar embed
          </button>
          <div
            className="discord-preview"
            style={{
              borderColor:
                "#" + (embed.color ?? 3697061).toString(16).padStart(6, "0"),
            }}
          >
            <small>VISTA APROXIMADA · DISCORD</small>
            {embed.author && <p>{embed.author.name}</p>}
            <strong>{embed.title}</strong>
            <p>{embed.description}</p>
            {embed.image && <p className="muted">Imagen: {embed.image}</p>}
            {embed.fields?.map((field, i) => (
              <div key={i}>
                <strong>{field.name}</strong>
                <p>{field.value}</p>
              </div>
            ))}
            <small>{embed.footer}</small>
          </div>
        </>
      )}
      {!parsed.success && (
        <p className="form-hint">{parsed.error.issues[0]?.message}</p>
      )}
    </div>
  );
}
