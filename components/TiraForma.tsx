import type { Resultado } from "@/data/mockData";

const tono: Record<Resultado, string> = {
  "ganó": "bg-jade",
  "perdió": "bg-oxido",
  "empató": "bg-tiza-tenue",
};

/** Los últimos cinco resultados de un competidor, del más antiguo al más reciente. */
export default function TiraForma({ forma }: { forma: Resultado[] }) {
  const ganados = forma.filter((r) => r === "ganó").length;

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
