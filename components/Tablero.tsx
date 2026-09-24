"use client";

import { useMemo, useState } from "react";
import {
  disciplinas,
  filtros,
  type DisciplinaId,
  type Partido,
} from "@/data/mockData";
import type { Alcance, Recomendacion } from "@/lib/analista";
import type { RendimientoHistorico } from "@/lib/pitchapi";
import AnalistaIA from "./AnalistaIA";
import FiltroDisciplinas from "./FiltroDisciplinas";
import GestorBanca from "./GestorBanca";
import SeccionEnVivo from "./SeccionEnVivo";
import TarjetaPartido from "./TarjetaPartido";

const TODAS = disciplinas.map((d) => d.id);

function disciplinasDe(filtroId: string): DisciplinaId[] {
  const filtro = filtros.find((f) => f.id === filtroId);
  if (!filtro || filtro.disciplinas.length === 0) return TODAS;
  return filtro.disciplinas;
}

/**
 * Cuerpo del tablero. Es lo único que corre en el navegador: recibe las
 * recomendaciones ya puntuadas en el servidor y solo decide cuáles se ven según
 * la disciplina elegida, así que cambiar de pestaña no vuelve a analizar nada.
 */
export default function Tablero({
  partidos,
  recomendaciones,
  alcances,
  rendimientoHistorico,
}: {
  partidos: Partido[];
  recomendaciones: Recomendacion[];
  alcances: Record<string, Alcance>;
  /** Contexto histórico de PitchAPI por id de partido; ausente cuando no hay clave o no se resolvió. */
  rendimientoHistorico?: Map<string, RendimientoHistorico>;
}) {
  const [filtro, setFiltro] = useState("todos");

  const conteos = useMemo(
    () =>
      Object.fromEntries(
        filtros.map((f) => {
          const suyas = f.disciplinas.length > 0 ? f.disciplinas : TODAS;
          return [f.id, partidos.filter((p) => suyas.includes(p.disciplina)).length];
        }),
      ),
    [partidos],
  );

  const ids = disciplinasDe(filtro);
  const picks = recomendaciones
    .filter((r) => ids.includes(r.partido.disciplina))
    .slice(0, 3);
  const visibles = disciplinas.filter((d) => ids.includes(d.id));

  return (
    <>
      <FiltroDisciplinas activo={filtro} onCambio={setFiltro} conteos={conteos} />

      <div className="pt-8">
        <SeccionEnVivo disciplinas={ids} />

        <AnalistaIA picks={picks} alcance={alcances[filtro]} />

        <GestorBanca picks={picks} />

        {visibles.map((disciplina) => {
          const suyos = partidos.filter((p) => p.disciplina === disciplina.id);
          if (suyos.length === 0) return null;

          return (
            <section key={disciplina.id} className="mt-12" aria-labelledby={disciplina.id}>
              <div className="flex items-baseline gap-3 border-b border-regla pb-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
                  style={{ backgroundColor: disciplina.acento }}
                  aria-hidden="true"
                />
                <h2
                  id={disciplina.id}
                  className="font-display text-2xl leading-none font-semibold"
                >
                  {disciplina.nombre}
                </h2>
                <span className="text-[13px] text-tiza-tenue">{disciplina.categoria}</span>
                <span className="cifra ml-auto text-[13px] text-tiza-tenue">
                  {suyos.length === 1 ? "1 partido" : `${suyos.length} partidos`}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {suyos.map((partido) => (
                  <TarjetaPartido
                    key={partido.id}
                    partido={partido}
                    rendimientoHistorico={rendimientoHistorico?.get(partido.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
