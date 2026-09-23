"use client";

import { useEffect, useState } from "react";
import { CICLO_SIMULACION, partidosEnVivo } from "@/data/enVivo";
import type { DisciplinaId } from "@/data/mockData";
import { lineasRotas, totalDeAlertas, type NotaTactica } from "@/lib/enVivo";
import PanelTactico from "./PanelTactico";
import TarjetaEnVivo from "./TarjetaEnVivo";

/** Cuánto tarda en avanzar un minuto de juego en la simulación. */
const MS_POR_MINUTO = 2500;

/**
 * Módulo In-Play.
 *
 * El reloj arranca en 0 tanto en el servidor como en el primer render del
 * cliente, y solo empieza a correr en el efecto: así el HTML servido coincide
 * con el hidratado. Cuando todos los partidos terminan, el ciclo vuelve a
 * empezar para que la demo no se quede muerta.
 *
 * El botón de pausa no es decorativo: WCAG 2.2.2 exige poder detener cualquier
 * contenido que se actualice solo.
 */
export default function SeccionEnVivo({ disciplinas }: { disciplinas: DisciplinaId[] }) {
  const [avance, setAvance] = useState(0);
  const [corriendo, setCorriendo] = useState(true);
  const [notas, setNotas] = useState<NotaTactica[]>([]);

  useEffect(() => {
    if (!corriendo) return;
    const reloj = setInterval(() => {
      setAvance((previo) => (previo >= CICLO_SIMULACION ? 0 : previo + 1));
    }, MS_POR_MINUTO);
    return () => clearInterval(reloj);
  }, [corriendo]);

  const visibles = partidosEnVivo.filter((p) => disciplinas.includes(p.disciplina));
  if (visibles.length === 0) return null;

  const notasVisibles = notas.filter((n) =>
    visibles.some((p) => p.id === n.partidoId),
  );
  const alertas = totalDeAlertas(visibles, avance, notasVisibles);
  const rotas = lineasRotas(visibles, avance, notasVisibles);

  return (
    <section aria-labelledby="en-vivo" className="mb-12 border-t-2 border-t-jade">
      <header className="flex flex-col gap-4 border-x border-b border-regla bg-tinta-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="en-vivo"
            className="flex items-center gap-2.5 font-display text-2xl leading-none font-semibold"
          >
            {corriendo && (
              <span className="latido h-2.5 w-2.5 rounded-[1px] bg-jade" aria-hidden="true" />
            )}
            In-Play
          </h2>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-tiza-media">
            Partidos en curso. Cada mercado se reevalúa proyectando el ritmo actual
            sobre su línea y comparándolo con el precio de apertura.
          </p>
        </div>

        <div className="flex shrink-0 items-end gap-5">
          <Cifra etiqueta="En juego" valor={visibles.length} />
          <Cifra etiqueta="Líneas rotas" valor={rotas} tono="jade" />
          <Cifra etiqueta="Alertas de valor" valor={alertas} destacar />
          <button
            type="button"
            onClick={() => setCorriendo((c) => !c)}
            aria-pressed={!corriendo}
            className="rounded-[2px] border border-regla px-3 py-1.5 font-display text-[15px] leading-none text-tiza-media transition-colors hover:border-tiza-tenue hover:text-tiza"
          >
            {corriendo ? "Pausar" : "Reanudar"}
          </button>
        </div>
      </header>

      <PanelTactico
        partidos={visibles}
        notas={notasVisibles}
        onAnadir={(n) => setNotas((previas) => [...previas, n])}
        onQuitar={(id) => setNotas((previas) => previas.filter((n) => n.id !== id))}
      />

      <div className="grid gap-4 border-x border-b border-regla bg-tinta-900 p-4 lg:grid-cols-2">
        {visibles.map((partido) => (
          <TarjetaEnVivo
            key={partido.id}
            partido={partido}
            avance={avance}
            notas={notasVisibles}
          />
        ))}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-tiza-tenue">
        Retransmisión simulada: el reloj avanza un minuto de juego cada {MS_POR_MINUTO / 1000}{" "}
        segundos sobre un guion de eventos fijo y reinicia el ciclo al terminar. Los
        cálculos son reales sobre ese guion, los partidos no.
      </p>
    </section>
  );
}

function Cifra({
  etiqueta,
  valor,
  destacar = false,
  tono,
}: {
  etiqueta: string;
  valor: number;
  destacar?: boolean;
  tono?: "jade";
}) {
  const color = tono === "jade" ? "text-jade" : destacar ? "text-ambar" : "text-tiza";
  return (
    <div>
      <p className="text-[12px] text-tiza-tenue">{etiqueta}</p>
      <p className={`cifra font-display text-[26px] leading-none font-semibold ${color}`}>
        {valor}
      </p>
    </div>
  );
}
