import type { Factor } from "@/lib/analista";

/**
 * Los cinco factores que produjeron el puntaje, con su peso y el dato crudo
 * detrás. El objetivo es que la confianza se pueda auditar de un vistazo en
 * lugar de aparecer como una cifra sin origen.
 */
export default function DesglosePuntaje({ factores }: { factores: Factor[] }) {
  return (
    <div>
      <p className="text-[12px] text-tiza-tenue">Cómo se formó el puntaje</p>
      <dl className="mt-2 space-y-1.5">
        {factores.map((factor) => (
          <div key={factor.nombre} className="flex items-center gap-3">
            <dt className="w-[112px] shrink-0 truncate text-[12px] text-tiza-media sm:w-[132px]">
              {factor.nombre}
            </dt>
            <dd className="flex min-w-0 flex-1 items-center gap-2.5">
              {/* La barra nunca cede su ancho mínimo: es la parte que hay que leer. */}
              <span
                className="flex h-1.5 min-w-[72px] max-w-[210px] flex-1 gap-px"
                aria-hidden="true"
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-[1px] ${
                      i < Math.round(factor.valor * 10) ? "bg-ambar/75" : "bg-regla"
                    }`}
                  />
                ))}
              </span>
              {/* El dato crudo se retira cuando no cabe: ya vive en las señales. */}
              <span className="cifra ml-auto hidden min-w-0 truncate text-right text-[11px] text-tiza-tenue sm:block">
                {factor.detalle}
              </span>
              <span className="cifra w-7 shrink-0 text-right text-[11px] text-tiza-tenue">
                {Math.round(factor.peso * 100)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
