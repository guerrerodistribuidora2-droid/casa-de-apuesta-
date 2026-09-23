import { filtros } from "@/data/mockData";

/**
 * Pestañas de disciplina. El subrayado marca la activa, y el número a su lado
 * dice cuántos partidos hay detrás antes de pulsar.
 */
export default function FiltroDisciplinas({
  activo,
  onCambio,
  conteos,
}: {
  activo: string;
  onCambio: (id: string) => void;
  conteos: Record<string, number>;
}) {
  return (
    <nav aria-label="Filtrar por disciplina" className="border-b border-regla">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {filtros.map((filtro) => {
          const seleccionado = filtro.id === activo;
          return (
            <li key={filtro.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onCambio(filtro.id)}
                aria-pressed={seleccionado}
                className={`flex items-baseline gap-2 border-b-2 px-3 py-2.5 font-display text-[18px] leading-none transition-colors ${
                  seleccionado
                    ? "border-ambar text-ambar"
                    : "border-transparent text-tiza-media hover:text-tiza"
                }`}
              >
                {filtro.etiqueta}
                <span
                  className={`cifra text-[12px] ${
                    seleccionado ? "text-ambar/70" : "text-tiza-tenue"
                  }`}
                >
                  {conteos[filtro.id] ?? 0}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
