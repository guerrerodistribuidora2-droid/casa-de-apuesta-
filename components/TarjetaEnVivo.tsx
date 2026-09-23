import { etiquetasContador, etiquetasEvento, type PartidoVivo } from "@/data/enVivo";
import { buscarDisciplina } from "@/data/mockData";
import {
  esAlerta,
  estadoEn,
  porRelevancia,
  type AlertaVivo,
  type NotaTactica,
} from "@/lib/enVivo";
import MedidorProbabilidad from "./MedidorProbabilidad";

/** Huecos de mercado que pinta cada tarjeta. Es fijo para que el alto no baile. */
const HUECOS = 2;

export default function TarjetaEnVivo({
  partido,
  avance,
  notas = [],
}: {
  partido: PartidoVivo;
  avance: number;
  notas?: NotaTactica[];
}) {
  const disciplina = buscarDisciplina(partido.disciplina);
  const estado = estadoEn(partido, partido.minutoInicial + avance);
  const mercados = porRelevancia(partido, avance, notas);
  const visibles = mercados.slice(0, HUECOS);
  const ocultos = mercados.length - visibles.length;

  // Lo más reciente primero: en vivo interesa el último minuto, no el primero.
  const ultimos = [...estado.ocurridos].reverse().slice(0, 2);

  return (
    <article
      className="flex flex-col border-y border-r border-regla border-l-[3px] bg-tinta-800"
      style={{ borderLeftColor: disciplina.acento }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-regla bg-tinta-700 px-4 py-2">
        <p className="truncate text-[13px] text-tiza-tenue">{partido.torneo}</p>
        <p className="flex shrink-0 items-center gap-2">
          {!estado.finalizado && (
            <span className="latido h-2 w-2 rounded-[1px] bg-jade" aria-hidden="true" />
          )}
          <span className="cifra font-display text-[16px] leading-none text-tiza">
            {estado.reloj}
          </span>
        </p>
      </div>

      <div className="space-y-1 px-4 pt-3">
        {(["local", "visitante"] as const).map((lado) => (
          <div key={lado} className="flex items-baseline gap-3">
            <h3 className="flex-1 truncate font-display text-[21px] leading-tight font-semibold">
              {partido[lado].nombre}
            </h3>
            <span className="cifra font-display text-[21px] leading-none font-bold">
              {estado.marcador[lado]}
            </span>
          </div>
        ))}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-regla px-4 pt-2.5">
        {Object.entries(estado.contadores)
          .filter(([clave]) => etiquetasContador[clave])
          .map(([clave, valor]) => (
            <div key={clave} className="flex items-baseline gap-1.5">
              <dt className="text-[12px] text-tiza-tenue">{etiquetasContador[clave]}</dt>
              <dd className="cifra text-[13px] text-tiza">{Math.round(valor)}</dd>
            </div>
          ))}
      </dl>

      {/* Alto reservado para dos incidencias: si la lista creciera y menguara,
          la tarjeta empujaría la página durante el scroll. */}
      <ul className="mt-2.5 flex min-h-[52px] flex-col justify-center border-t border-regla px-4 pt-2.5">
        {ultimos.length === 0 && (
          <li className="text-[12px] text-tiza-tenue">Sin incidencias recientes.</li>
        )}
          {ultimos.map((evento) => (
            <li key={`${evento.minuto}-${evento.tipo}`} className="flex gap-2.5 py-0.5">
              <span className="cifra w-8 shrink-0 text-[12px] text-tiza-tenue">
                {evento.minuto}&apos;
              </span>
              <span className="w-[62px] shrink-0 text-[12px] text-tiza">
                {etiquetasEvento[evento.tipo]}
              </span>
              <span className="flex-1 truncate text-[12px] text-tiza-media">
                {evento.detalle}
              </span>
            </li>
          ))}
      </ul>

      <div className="mt-3 flex-1 border-t border-regla px-4 py-3">
        <div className="space-y-3">
          {visibles.map((lectura) => (
            <Alerta key={lectura.mercado.mercado} alerta={lectura} />
          ))}
        </div>

        {ocultos > 0 && (
          <p className="cifra mt-2.5 text-[12px] text-tiza-tenue">
            {ocultos === 1 ? "1 mercado más en seguimiento" : `${ocultos} mercados más en seguimiento`}
          </p>
        )}
      </div>
    </article>
  );
}

function Alerta({ alerta }: { alerta: AlertaVivo }) {
  const sube = alerta.desplazamiento >= 0;
  const destacado = esAlerta(alerta);

  return (
    <div
      className={`border-l-2 px-3.5 py-3 ${
        alerta.lineaRota
          ? "border-ambar bg-ambar/10"
          : destacado
            ? "border-ambar/55 bg-tinta-900"
            : "border-regla bg-tinta-900"
      }`}
    >
      <p
        className={`text-[11px] ${alerta.lineaRota ? "text-ambar" : "text-tiza-tenue"}`}
      >
        {alerta.lineaRota
          ? "Línea rota a favor"
          : destacado
            ? "Alerta de valor"
            : "En seguimiento"}
      </p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h4 className="font-display text-[18px] leading-tight text-tiza">
          {alerta.mercado.mercado}
        </h4>
        <span
          className={`cifra shrink-0 rounded-[2px] border px-1.5 py-px text-[11px] leading-5 ${
            sube ? "border-jade/50 text-jade" : "border-oxido/60 text-oxido"
          }`}
        >
          {sube ? "+" : ""}
          {alerta.desplazamiento} pts
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-3">
        <span className="cifra font-display text-[28px] leading-none font-bold text-ambar">
          {alerta.probabilidad}%
        </span>
        <span className="cifra text-[12px] text-tiza-tenue">
          abrió en {alerta.mercado.previa}%
        </span>
        {alerta.resuelto && !alerta.lineaRota && (
          <span className="cifra ml-auto text-[12px] text-jade">Resuelto</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2.5">
        <span className="shrink-0 text-[11px] text-tiza-tenue">Fiabilidad</span>
        <MedidorProbabilidad
          probabilidad={alerta.confianza}
          etiqueta={`Fiabilidad de la lectura en vivo de ${alerta.mercado.mercado}`}
          tono="tiza"
        />
        <span className="cifra text-[12px] text-tiza-media">{alerta.confianza}%</span>
      </div>

      <p className="mt-2.5 line-clamp-3 text-[12px] leading-relaxed text-tiza-media">
        {alerta.razonamiento}
      </p>

      {(alerta.disparadores.length > 0 || alerta.notas.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {alerta.notas.map((n) => (
            <li
              key={n.id}
              className={`cifra rounded-[2px] border px-1.5 py-px text-[11px] leading-5 ${
                n.direccion === "a favor"
                  ? "border-jade/50 text-jade"
                  : "border-oxido/60 text-oxido"
              }`}
            >
              {n.texto} {n.direccion === "a favor" ? "+" : "-"}
              {n.intensidad}
            </li>
          ))}
          {alerta.disparadores.map((d) => (
            <li
              key={d}
              className="cifra rounded-[2px] border border-regla px-1.5 py-px text-[11px] leading-5 text-tiza-tenue"
            >
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
