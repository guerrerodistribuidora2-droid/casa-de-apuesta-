import { buscarDisciplina } from "@/data/mockData";
import type { Alcance, Recomendacion } from "@/lib/analista";
import DesgloseFactores from "./DesgloseFactores";
import DesglosePuntaje from "./DesglosePuntaje";
import LecturaDestacada from "./LecturaDestacada";
import MedidorProbabilidad from "./MedidorProbabilidad";
import RazonamientoIA from "./RazonamientoIA";
import TiraFrecuencia from "./TiraFrecuencia";

/**
 * Las mejores apuestas del día según el motor de `lib/analista.ts`.
 * Abre el tablero: la primera va a gran escala y con el desglose del puntaje,
 * las dos siguientes en formato compacto.
 */
export default function AnalistaIA({
  picks,
  alcance,
}: {
  picks: Recomendacion[];
  alcance: Alcance;
}) {
  if (picks.length === 0) {
    return (
      <section className="border-t-2 border-t-ambar border-x border-b border-regla bg-tinta-800 p-6">
        <h2 className="font-display text-2xl font-semibold">🤖 IA Match Analyzer</h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-tiza-media">
          Ninguna lectura de esta selección supera el umbral de confiabilidad. Prueba
          con otra disciplina o vuelve cuando se publique la próxima jornada.
        </p>
      </section>
    );
  }

  const [primera, ...resto] = picks;

  return (
    <section aria-labelledby="analista" className="border-t-2 border-t-ambar">
      <header className="flex flex-col gap-4 border-x border-b border-regla bg-tinta-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="analista" className="font-display text-2xl leading-none font-semibold">
            🤖 IA Match Analyzer
          </h2>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-tiza-media">
            Top picks del día. Al respaldo histórico y la convicción del modelo se le
            suman los factores medidos del encuentro: perfil del árbitro contra la media
            de su liga, carga de calendario y peso real de las bajas.
          </p>
        </div>

        <dl className="flex shrink-0 gap-5">
          <Cifra etiqueta="Lecturas evaluadas" valor={alcance.evaluadas} />
          <Cifra etiqueta="Descartadas" valor={alcance.total - alcance.evaluadas} />
          <Cifra etiqueta="Seleccionadas" valor={picks.length} destacar />
        </dl>
      </header>

      <PickPrincipal pick={primera} />

      {resto.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {resto.map((pick, i) => (
            <PickCompacto key={pick.lectura.mercado + pick.partido.id} pick={pick} rango={i + 2} />
          ))}
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-tiza-tenue">
        El puntaje sale de un sistema de reglas que corre en local sobre los datos
        simulados: no hay modelo de lenguaje ni fuente externa, y para los mismos datos
        el resultado siempre es el mismo.
      </p>
    </section>
  );
}

/** La recomendación número uno, a gran escala. */
function PickPrincipal({ pick }: { pick: Recomendacion }) {
  const disciplina = buscarDisciplina(pick.partido.disciplina);

  return (
    <article
      className="border-x border-b border-regla border-l-[3px] bg-tinta-800"
      style={{ borderLeftColor: disciplina.acento }}
    >
      <CabeceraPick pick={pick} rango={1} />
      <LecturaDestacada partido={pick.partido} lectura={pick.lectura} enmarcado={false} />
      <div className="grid items-start gap-4 px-5 pb-5 sm:px-7 sm:pb-7 lg:grid-cols-2">
        <RazonamientoIA razonamiento={pick.razonamiento} senales={pick.senales} />
        <div className="space-y-4">
          <DesgloseFactores efectos={pick.efectos} neto={pick.empujeContexto} />
          <div className="border border-regla bg-tinta-900 px-3.5 py-3">
            <DesglosePuntaje factores={pick.factores} />
          </div>
        </div>
      </div>
    </article>
  );
}

/** Recomendaciones dos y tres. */
function PickCompacto({ pick, rango }: { pick: Recomendacion; rango: number }) {
  const disciplina = buscarDisciplina(pick.partido.disciplina);

  return (
    <article
      className="flex flex-col border-y border-r border-regla border-l-[3px] bg-tinta-800"
      style={{ borderLeftColor: disciplina.acento }}
    >
      <CabeceraPick pick={pick} rango={rango} />

      <div className="px-5 pt-4">
        <p className="truncate text-[13px] text-tiza-tenue">{pick.partido.torneo}</p>
        <h3 className="mt-1 font-display text-[26px] leading-tight font-bold">
          {pick.partido.local.nombre}
          <span className="text-tiza-tenue"> contra </span>
          {pick.partido.visitante.nombre}
        </h3>

        <p className="mt-3 font-display text-[20px] leading-tight text-tiza">
          {pick.lectura.mercado}
        </p>

        <div className="mt-2.5 flex items-center gap-3">
          <MedidorProbabilidad probabilidad={pick.lectura.probabilidad} />
          <span className="cifra font-display text-[26px] leading-none font-semibold text-ambar">
            {pick.lectura.probabilidad}%
          </span>
          <span className="cifra ml-auto text-[13px] text-tiza-tenue">
            {pick.partido.cuando} {pick.partido.hora}
          </span>
        </div>

        <div className="mt-3">
          <TiraFrecuencia historial={pick.lectura.historial} />
        </div>
      </div>

      <div className="mt-4 px-5 pb-5">
        <RazonamientoIA razonamiento={pick.razonamiento} senales={pick.senales} />
      </div>
    </article>
  );
}

/** Franja con el puesto en la selección y el porcentaje de confianza. */
function CabeceraPick({ pick, rango }: { pick: Recomendacion; rango: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-regla bg-tinta-700 px-5 py-2.5">
      <p className="cifra font-display text-[15px] text-tiza-media">
        Recomendación {rango}
      </p>
      <p className="flex items-baseline gap-2">
        <span className="text-[12px] text-tiza-tenue">Confianza</span>
        <span className="cifra font-display text-[24px] leading-none font-bold text-ambar">
          {pick.confianza}%
        </span>
      </p>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  destacar = false,
}: {
  etiqueta: string;
  valor: number;
  destacar?: boolean;
}) {
  return (
    <div>
      <dt className="text-[12px] text-tiza-tenue">{etiqueta}</dt>
      <dd
        className={`cifra font-display text-[26px] leading-none font-semibold ${
          destacar ? "text-ambar" : "text-tiza"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
