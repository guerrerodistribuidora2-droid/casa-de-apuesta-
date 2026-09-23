import type { Lectura } from "@/data/mockData";

/**
 * Los últimos diez desenlaces del mercado, uno por bloque, del más antiguo al
 * más reciente. Es el elemento central del tablero: la frecuencia se cuenta,
 * no se resume.
 */
export default function TiraFrecuencia({
  historial,
  alto = "normal",
}: {
  historial: Lectura["historial"];
  alto?: "normal" | "alto";
}) {
  const alturaBloque = alto === "alto" ? "h-7" : "h-4";
  const cumplidos = historial.filter(Boolean).length;

  // Sin historial (partido real sin frecuencia propia todavía) la tira no
  // debe colapsar a un hueco en blanco: es el elemento que más se repite en
  // el tablero y un vacío ahí se lee como un error de carga, no como un dato
  // ausente.
  if (historial.length === 0) {
    return (
      <p
        className={`${alturaBloque === "h-7" ? "text-[13px]" : "text-[12px]"} text-tiza-tenue`}
      >
        Sin historial propio todavía
      </p>
    );
  }

  return (
    <div
      className="flex items-end gap-[3px]"
      role="img"
      aria-label={`Se cumplió en ${cumplidos} de los últimos ${historial.length} encuentros`}
    >
      {historial.map((cumplio, i) => (
        <span
          key={i}
          className={`${alturaBloque} flex-1 rounded-[1px] ${
            cumplio ? "bg-jade" : "bg-oxido/45"
          }`}
        />
      ))}
    </div>
  );
}
