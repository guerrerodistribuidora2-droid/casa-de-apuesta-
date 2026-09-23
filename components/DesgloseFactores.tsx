import type { EfectoFactor } from "@/lib/factores";

/**
 * Qué mueve la línea y cuánto. Cada fila enseña la medición que produjo el
 * desplazamiento, de forma que el puntaje se pueda discutir con el dato delante
 * en lugar de aceptarlo por fe.
 */
export default function DesgloseFactores({
  efectos,
  neto,
}: {
  efectos: EfectoFactor[];
  neto: number;
}) {
  if (efectos.length === 0) {
    return (
      <div className="border border-regla bg-tinta-900 px-3.5 py-3">
        <p className="text-[12px] text-tiza-tenue">Factores que mueven la línea</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-tiza-media">
          Este partido no tiene factores medidos. La lectura se sostiene solo en la
          frecuencia.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-regla bg-tinta-900 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-tiza-tenue">Factores que mueven la línea</p>
        <p
          className={`cifra text-[13px] ${neto >= 0 ? "text-jade" : "text-oxido"}`}
        >
          {neto > 0 ? "+" : ""}
          {neto} pts netos
        </p>
      </div>

      <ul className="mt-2.5 space-y-2.5">
        {efectos.map((efecto) => (
          <li key={efecto.fuente + efecto.detalle}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[15px] leading-none text-tiza">
                {efecto.fuente}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="cifra text-[11px] text-tiza-tenue">
                  solidez {Math.round(efecto.solidez * 100)}%
                </span>
                <span
                  className={`cifra font-display text-[16px] leading-none ${
                    efecto.puntos >= 0 ? "text-jade" : "text-oxido"
                  }`}
                >
                  {efecto.puntos > 0 ? "+" : ""}
                  {efecto.puntos}
                </span>
              </span>
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-tiza-media">
              {efecto.detalle}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
