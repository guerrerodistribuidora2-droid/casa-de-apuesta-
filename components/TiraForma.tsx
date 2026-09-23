import type { Resultado } from "@/data/mockData";

const tono: Record<Resultado, string> = {
  "ganó": "bg-jade",
  "perdió": "bg-oxido",
  "empató": "bg-tiza-tenue",
};

/** Los últimos cinco resultados de un competidor, del más antiguo al más reciente. */
export default function TiraForma({ forma }: { forma: Resultado[] }) {
  const ganados = forma.filter((r) => r === "ganó").length;

  // Un partido recién incorporado desde una fuente en vivo no trae todavía su
  // racha de resultados. Una tira vacía se leería como un fallo visual, no
  // como "sin datos": mejor decirlo.
  if (forma.length === 0) {
    return <span className="text-[11px] text-tiza-tenue">Sin racha registrada</span>;
  }

  return (
    <div
      className="flex items-center gap-[3px]"
      role="img"
      aria-label={`Ganó ${ganados} de sus últimos ${forma.length} encuentros`}
    >
      {forma.map((resultado, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-[1px] ${tono[resultado]} ${
            i === forma.length - 1 ? "" : "opacity-55"
          }`}
        />
      ))}
    </div>
  );
}
