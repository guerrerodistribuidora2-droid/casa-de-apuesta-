import { etiquetasContexto, type Contexto, type Lectura, type Partido } from "@/data/mockData";
import { efectosSobre } from "@/lib/factores";

/**
 * Lesiones, árbitro designado, rotaciones y carga de calendario.
 *
 * El cuadrado de color reutiliza el lenguaje de conteo del tablero: verde para
 * lo que empuja el mercado mostrado, óxido para lo que lo frena y tenue para lo
 * que solo informa. El signo no viene escrito en los datos: lo calcula
 * `lib/factores.ts` a partir de las mediciones.
 */
export default function NotasContexto({
  partido,
  lectura,
  limite,
  compacto = false,
}: {
  partido: Partido;
  /** Mercado respecto al que se juzga cada nota. */
  lectura: Lectura;
  limite?: number;
  compacto?: boolean;
}) {
  const contexto = partido.contexto ?? [];
  if (contexto.length === 0) return null;

  // Los factores que mueven el mercado mostrado van primero.
  const puntosDe = new Map<Contexto, number>();
  for (const nota of contexto) {
    const efecto = efectosSobre({ ...partido, contexto: [nota] }, lectura)[0];
    puntosDe.set(nota, efecto?.puntos ?? 0);
  }

  const ordenadas = [...contexto].sort(
    (a, b) => Math.abs(puntosDe.get(b) ?? 0) - Math.abs(puntosDe.get(a) ?? 0),
  );
  const visibles = limite ? ordenadas.slice(0, limite) : ordenadas;
  const ocultas = ordenadas.length - visibles.length;

  return (
    <div>
      <p className="text-[12px] text-tiza-tenue">Factores del partido</p>
      <ul className="mt-1.5 space-y-1.5">
        {visibles.map((nota) => {
          const puntos = puntosDe.get(nota) ?? 0;
          const tono =
            puntos > 0 ? "bg-jade" : puntos < 0 ? "bg-oxido" : "bg-tiza-tenue";

          return (
            <li key={nota.nota} className="flex gap-2.5">
              <span
                className={`mt-[5px] h-2 w-2 shrink-0 rounded-[1px] ${tono}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p
                  className={`${compacto ? "text-[12px]" : "text-[13px]"} leading-relaxed text-tiza-media`}
                >
                  <span className="text-tiza">{etiquetasContexto[nota.tipo]}.</span>{" "}
                  {nota.nota}
                  {puntos !== 0 && (
                    <span className="cifra text-tiza-tenue">
                      {" "}
                      ({puntos > 0 ? "+" : ""}
                      {puntos} pts)
                    </span>
                  )}
                </p>
                {nota.origen === "noticia" && nota.fuente && (
                  <p className="cifra mt-0.5 text-[11px] text-tiza-tenue">
                    Detectado en prensa · {nota.fuente.medio} ·{" "}
                    {nota.fuente.coincidencias.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {ocultas > 0 && (
        <p className="cifra mt-1.5 text-[12px] text-tiza-tenue">
          {ocultas === 1 ? "1 factor más" : `${ocultas} factores más`}
        </p>
      )}
    </div>
  );
}
