const TOTAL_MARCAS = 20;

/**
 * Probabilidad en marcas de cinco puntos, no en barra continua: se lee contando,
 * igual que la tira de frecuencia.
 */
export default function MedidorProbabilidad({
  probabilidad,
  escala = "normal",
  etiqueta = "Probabilidad estimada",
  tono = "ambar",
}: {
  probabilidad: number;
  escala?: "normal" | "amplia";
  /** Qué mide, para lectores de pantalla. */
  etiqueta?: string;
  tono?: "ambar" | "tiza";
}) {
  const encendidas = Math.round((probabilidad / 100) * TOTAL_MARCAS);
  const altura = escala === "amplia" ? "h-5" : "h-3";

  return (
    <div
      className="flex items-center gap-[2px]"
      role="meter"
      aria-valuenow={probabilidad}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={etiqueta}
    >
      {Array.from({ length: TOTAL_MARCAS }, (_, i) => (
        <span
          key={i}
          className={`${altura} w-[3px] rounded-[1px] ${
            i < encendidas
              ? tono === "ambar"
                ? "bg-ambar"
                : "bg-tiza-media"
              : "bg-regla"
          }`}
        />
      ))}
    </div>
  );
}
