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
