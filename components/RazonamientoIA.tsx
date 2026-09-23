/**
 * La explicación de por qué una lectura entró en la selección. El texto se
 * construye en `lib/analista.ts` a partir de los datos del partido, nunca se
 * escribe a mano.
 */
export default function RazonamientoIA({
  razonamiento,
  senales,
}: {
  razonamiento: string;
  senales: string[];
}) {
  return (
    <div className="border-l-2 border-ambar/55 bg-tinta-900 px-3.5 py-3">
      <p className="text-[12px] text-tiza-tenue">Razonamiento del analista</p>
      <p className="mt-1.5 max-w-[78ch] text-[13px] leading-relaxed text-tiza-media">
        {razonamiento}
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {senales.map((senal) => (
          <li
            key={senal}
            className="cifra rounded-[2px] border border-regla px-1.5 py-px text-[11px] leading-5 text-tiza-tenue"
          >
            {senal}
          </li>
        ))}
      </ul>
    </div>
  );
}
