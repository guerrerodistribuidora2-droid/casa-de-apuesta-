import type { RendimientoHistorico } from "@/lib/pitchapi";

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Cuadrícula de calor real (16x12 en la API), redibujada como una rejilla de
 * celdas en vez de arte ASCII: en una página web una intensidad de color se
 * lee de un vistazo, donde el ASCII exige monoespaciado y entrecerrar los
 * ojos. El dato es el mismo que en `pitchapi/reporte.py` — celdas dispersas
 * ya expandidas por `lib/pitchapi.ts` —, solo cambia cómo se pinta.
 */
function MiniHeatmap({
  heatmap,
  longitud,
  ancho,
}: {
  heatmap: number[][];
  longitud: number;
  ancho: number;
}) {
  const maximo = Math.max(0, ...heatmap.flat());

  const celdas = Array.from({ length: ancho }, (_, y) =>
    Array.from({ length: longitud }, (_, x) => heatmap[x]?.[y] ?? 0),
  ).flat();

  return (
    <div
      className="grid gap-px rounded-[2px] border border-regla bg-tinta-900 p-px"
      style={{ gridTemplateColumns: `repeat(${longitud}, 1fr)`, aspectRatio: `${longitud} / ${ancho}` }}
      role="img"
      aria-label="Mapa de calor de acciones sobre el terreno de juego"
    >
      {celdas.map((valor, i) => (
        <div
          key={i}
          style={{
            backgroundColor: `rgba(224, 160, 58, ${maximo > 0 ? (valor / maximo).toFixed(2) : 0})`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Contexto histórico real de PitchAPI: el último enfrentamiento YA JUGADO
 * entre estos dos equipos, con sus métricas avanzadas (VAEP, PPDA) y su
 * mapa de calor. Etiquetado explícitamente como histórico en todo momento —
 * nunca se presenta como una proyección del partido de hoy, que es lo que
 * muestra el resto de la tarjeta.
 */
export default function PanelRendimientoAvanzado({
  rendimiento,
}: {
  rendimiento: RendimientoHistorico;
}) {
  return (
    <div className="mt-3 border-t border-regla pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-tiza-tenue">
          Contexto histórico · último enfrentamiento real
        </p>
        <p className="cifra text-[12px] text-tiza-tenue">{formatearFecha(rendimiento.fechaISO)}</p>
      </div>

      <p className="cifra mt-1 text-[13px] text-tiza-media">
        {rendimiento.local.nombre} {rendimiento.marcador.local}-{rendimiento.marcador.visitante}{" "}
        {rendimiento.visitante.nombre}
        <span className="text-tiza-tenue"> · {rendimiento.liga}</span>
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-3">
        {[rendimiento.local, rendimiento.visitante].map((equipo) => (
          <div key={equipo.nombre} className="min-w-0">
            <p className="truncate text-[12px] text-tiza-media">{equipo.nombre}</p>
            <p className="cifra text-[11px] text-tiza-tenue">
              VAEP {equipo.vaepTotal.toFixed(2)} · PPDA {equipo.ppda.toFixed(1)}
            </p>
            <div className="mt-1.5">
              <MiniHeatmap
                heatmap={equipo.heatmap}
                longitud={rendimiento.grid.longitud}
                ancho={rendimiento.grid.ancho}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-tiza-tenue">
        Datos reales de un partido ya jugado entre estos dos equipos — no es una
        proyección de este encuentro.
      </p>
    </div>
  );
}
