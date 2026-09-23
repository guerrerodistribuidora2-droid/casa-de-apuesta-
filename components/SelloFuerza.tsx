import { fuerza, type Lectura } from "@/data/mockData";

const estilo: Record<ReturnType<typeof fuerza>, string> = {
  firme: "border-ambar/60 text-ambar",
  moderada: "border-regla text-tiza-media",
  "débil": "border-regla text-tiza-tenue",
};

/** Cuán fiable es la lectura según probabilidad, muestra y acuerdo con el historial. */
export default function SelloFuerza({ lectura }: { lectura: Lectura }) {
  const nivel = fuerza(lectura);

  return (
    <span
      className={`shrink-0 rounded-[2px] border px-1.5 py-px text-[11px] leading-5 ${estilo[nivel]}`}
    >
      Lectura {nivel}
    </span>
  );
}
