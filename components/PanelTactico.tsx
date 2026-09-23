"use client";

import { useState } from "react";
import type { PartidoVivo } from "@/data/enVivo";
import type { NotaTactica } from "@/lib/enVivo";

/**
 * Panel de alimentación en vivo.
 *
 * Quien está viendo el partido ve cosas que el guion de eventos no recoge: un
 * cambio de esquema al descanso, una presión asfixiante, un equipo que se echa
 * atrás. Este panel deja introducir esa lectura y el motor la suma a su cálculo
 * con la intensidad indicada, en lugar de obligar a tocar los datos.
 */
export default function PanelTactico({
  partidos,
  notas,
  onAnadir,
  onQuitar,
}: {
  partidos: PartidoVivo[];
  notas: NotaTactica[];
  onAnadir: (nota: NotaTactica) => void;
  onQuitar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [partidoId, setPartidoId] = useState(partidos[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [direccion, setDireccion] = useState<NotaTactica["direccion"]>("a favor");
  const [intensidad, setIntensidad] = useState(6);

  const sugerencias = [
    "Cambio de esquema al medio tiempo",
    "Presión asfixiante en campo contrario",
    "El favorito se echa atrás con la ventaja",
    "Entra un delantero por un centrocampista",
  ];

  function enviar() {
    const limpio = texto.trim();
    if (!limpio || !partidoId) return;
    onAnadir({
      id: `${partidoId}-${Date.now()}`,
      partidoId,
      texto: limpio,
      direccion,
      intensidad,
    });
    setTexto("");
  }

  return (
    <div className="border-x border-b border-regla bg-tinta-900 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <p className="text-[12px] text-tiza-tenue">Alimentación táctica</p>
          {notas.length > 0 && (
            <p className="cifra text-[12px] text-tiza-media">
              {notas.length} {notas.length === 1 ? "nota activa" : "notas activas"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="rounded-[2px] border border-regla px-2.5 py-1 font-display text-[14px] leading-none text-tiza-media transition-colors hover:border-ambar hover:text-ambar"
        >
          {abierto ? "Cerrar panel" : "Añadir nota"}
        </button>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3 border-t border-regla pt-3">
          <div className="flex flex-wrap gap-3">
            <label className="block flex-1 min-w-[200px]">
              <span className="block text-[12px] text-tiza-tenue">Partido</span>
              <select
                value={partidoId}
                onChange={(e) => setPartidoId(e.target.value)}
                className="mt-1 w-full rounded-[2px] border border-regla bg-tinta-800 px-2 py-1.5 font-display text-[15px] text-tiza"
              >
                {partidos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.local.nombre} contra {p.visitante.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[12px] text-tiza-tenue">Dirección</span>
              <select
                value={direccion}
                onChange={(e) => setDireccion(e.target.value as NotaTactica["direccion"])}
                className="mt-1 rounded-[2px] border border-regla bg-tinta-800 px-2 py-1.5 font-display text-[15px] text-tiza"
              >
                <option value="a favor">A favor</option>
                <option value="en contra">En contra</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[12px] text-tiza-tenue">Intensidad (pts)</span>
              <input
                type="number"
                min={1}
                max={20}
                value={intensidad}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setIntensidad(Math.min(Math.max(v, 1), 20));
                }}
                className="cifra mt-1 w-24 rounded-[2px] border border-regla bg-tinta-800 px-2 py-1.5 font-display text-[15px] text-tiza"
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="block text-[12px] text-tiza-tenue">Qué estás viendo</span>
              <input
                type="text"
                value={texto}
                maxLength={120}
                placeholder="Cambio de esquema al medio tiempo"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enviar();
                }}
                className="mt-1 w-full rounded-[2px] border border-regla bg-tinta-800 px-2 py-1.5 text-[14px] text-tiza placeholder:text-tiza-tenue"
              />
            </label>

            <ul className="mt-2 flex flex-wrap gap-1.5">
              {sugerencias.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setTexto(s)}
                    className="rounded-[2px] border border-regla px-1.5 py-px text-[11px] leading-5 text-tiza-tenue transition-colors hover:border-tiza-tenue hover:text-tiza-media"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={enviar}
            disabled={texto.trim().length === 0}
            className="rounded-[2px] border border-ambar/60 px-3 py-1.5 font-display text-[15px] leading-none text-ambar transition-colors hover:bg-ambar hover:text-tinta-900 disabled:border-regla disabled:text-tiza-tenue disabled:hover:bg-transparent disabled:hover:text-tiza-tenue"
          >
            Aplicar al motor
          </button>
        </div>
      )}

      {notas.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-regla pt-3">
          {notas.map((nota) => {
            const partido = partidos.find((p) => p.id === nota.partidoId);
            return (
              <li key={nota.id} className="flex items-baseline gap-2.5 text-[12px]">
                <span
                  className={`mt-[5px] h-2 w-2 shrink-0 rounded-[1px] ${
                    nota.direccion === "a favor" ? "bg-jade" : "bg-oxido"
                  }`}
                  aria-hidden="true"
                />
                <span className="text-tiza-media">{nota.texto}</span>
                <span className="cifra shrink-0 text-tiza-tenue">
                  {nota.direccion === "a favor" ? "+" : "-"}
                  {nota.intensidad}
                </span>
                <span className="truncate text-tiza-tenue">
                  {partido ? partido.local.clave : "?"}
                </span>
                <button
                  type="button"
                  onClick={() => onQuitar(nota.id)}
                  className="ml-auto shrink-0 text-tiza-tenue transition-colors hover:text-oxido"
                  aria-label={`Quitar nota: ${nota.texto}`}
                >
                  Quitar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
