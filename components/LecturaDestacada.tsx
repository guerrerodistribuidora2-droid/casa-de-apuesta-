import {
  buscarDisciplina,
  cuotaJusta,
  divergencia,
  lecturaPrincipal,
  tasaDeAcierto,
  type Lectura,
  type Partido,
} from "@/data/mockData";
import MedidorProbabilidad from "./MedidorProbabilidad";
import NotasContexto from "./NotasContexto";
import SelloFuerza from "./SelloFuerza";
import TiraForma from "./TiraForma";
import TiraFrecuencia from "./TiraFrecuencia";

/**
 * Un partido a gran escala con uno de sus mercados destacado. Por defecto
 * destaca la lectura de mayor probabilidad, pero acepta cualquier otra para
 * poder reutilizarse como cabecera de una recomendación del analista.
 *
 * Con "enmarcado" en false pierde su propio borde y fondo, para anidarla dentro
 * de una tarjeta que ya los aporta.
 */
export default function LecturaDestacada({
  partido,
  lectura = lecturaPrincipal(partido),
  enmarcado = true,
}: {
  partido: Partido;
  lectura?: Lectura;
  enmarcado?: boolean;
}) {
  const disciplina = buscarDisciplina(partido.disciplina);
  const principal = lectura;
  const brecha = divergencia(principal);
  const tituloId = `destacada-${partido.id}`;

  const contenido = (
      <div className="flex flex-col gap-8 p-5 sm:p-7 lg:flex-row lg:gap-10">
        {/* Identidad del partido */}
        <div className="flex flex-col lg:w-[38%]">
          <p className="text-[13px] text-tiza-tenue">
            {partido.torneo}
          </p>
          <h2 id={tituloId} className="mt-3 font-display text-4xl leading-[1.05] font-bold sm:text-5xl">
            {partido.local.nombre}
            <span className="block text-tiza-tenue">contra</span>
            {partido.visitante.nombre}
          </h2>

          {partido.contexto && partido.contexto.length > 0 && (
            <div className="mt-5 border-t border-regla pt-4">
              <NotasContexto partido={partido} lectura={principal} />
            </div>
          )}

          <dl className="mt-5 space-y-2 border-t border-regla pt-4 text-[13px] lg:mt-auto">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-tiza-media">{partido.local.clave} en sus últimos cinco</dt>
              <dd>
                <TiraForma forma={partido.local.forma} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-tiza-media">{partido.visitante.clave} en sus últimos cinco</dt>
              <dd>
                <TiraForma forma={partido.visitante.forma} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-tiza-media">Comienza</dt>
              <dd className="cifra font-display text-[17px]">
                {partido.cuando} {partido.hora}
              </dd>
            </div>
          </dl>
        </div>

        {/* La lectura */}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-display text-[28px] leading-tight font-semibold sm:text-[32px]">
              {principal.mercado}
            </h3>
            <SelloFuerza lectura={principal} />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <MedidorProbabilidad probabilidad={principal.probabilidad} escala="amplia" />
            <span className="cifra font-display text-5xl leading-none font-bold text-ambar">
              {principal.probabilidad}%
            </span>
          </div>

          <div className="mt-5">
            <TiraFrecuencia historial={principal.historial} alto="alto" />
            <p className="mt-2 cifra text-[13px] text-tiza-media">
              {principal.frecuencia.muestra === 0
                ? "Partido real sin historial propio todavía: la probabilidad viene del mercado."
                : `Cumplido en ${principal.frecuencia.exitos} de ${principal.frecuencia.muestra} encuentros analizados. Arriba, los últimos diez del más antiguo al más reciente.`}
            </p>
          </div>

          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-tiza-media">
            {principal.nota}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-px border border-regla bg-regla sm:grid-cols-3">
            <Dato etiqueta="Frecuencia observada" valor={`${tasaDeAcierto(principal).toFixed(0)}%`} />
            <Dato
              etiqueta="Distancia con el modelo"
              valor={`${brecha >= 0 ? "+" : ""}${brecha.toFixed(1)} pts`}
            />
            <Dato
              etiqueta="Cuota justa"
              valor={cuotaJusta(principal).toFixed(2)}
              claseExtra="col-span-2 sm:col-span-1"
            />
          </div>

          {partido.lecturas.length > 1 && (
            <>
            <p className="mt-5 text-[12px] text-tiza-tenue">Otras lecturas de este partido</p>
            <ul className="mt-2 border-t border-regla">
              {partido.lecturas
                .filter((l) => l.mercado !== principal.mercado)
                .map((l) => (
                  <li
                    key={l.mercado}
                    className="flex items-center gap-4 border-b border-regla py-2.5"
                  >
                    <span className="flex-1 truncate font-display text-[17px]">{l.mercado}</span>
                    <span className="hidden w-28 sm:block">
                      <TiraFrecuencia historial={l.historial} />
                    </span>
                    <span className="cifra w-10 text-right font-display text-[17px] text-tiza-media">
                      {l.probabilidad}%
                    </span>
                  </li>
                ))}
            </ul>
            </>
          )}
        </div>
      </div>
  );

  if (!enmarcado) return contenido;

  return (
    <section
      aria-labelledby={tituloId}
      className="border-y border-r border-regla border-l-[3px] bg-tinta-800"
      style={{ borderLeftColor: disciplina.acento }}
    >
      {contenido}
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  claseExtra = "",
}: {
  etiqueta: string;
  valor: string;
  claseExtra?: string;
}) {
  return (
    <div className={`bg-tinta-800 px-3 py-2.5 ${claseExtra}`}>
      <p className="text-[12px] text-tiza-tenue">{etiqueta}</p>
      <p className="cifra mt-0.5 font-display text-[22px] leading-none">{valor}</p>
    </div>
  );
}
