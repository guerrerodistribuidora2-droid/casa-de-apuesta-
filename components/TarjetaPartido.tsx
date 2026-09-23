import {
  buscarDisciplina,
  cuotaJusta,
  lecturaPrincipal,
  rachaActual,
  type Partido,
} from "@/data/mockData";
import MedidorProbabilidad from "./MedidorProbabilidad";
import NotasContexto from "./NotasContexto";
import SelloFuerza from "./SelloFuerza";
import TiraForma from "./TiraForma";
import TiraFrecuencia from "./TiraFrecuencia";

function describirRacha({ largo, cumplida }: ReturnType<typeof rachaActual>): string {
  if (cumplida) {
    return largo === 1 ? "Se cumplió la última vez" : `Se cumplió las últimas ${largo} veces`;
  }
  return largo === 1 ? "No se cumplió la última vez" : `Lleva ${largo} sin cumplirse`;
}

export default function TarjetaPartido({ partido }: { partido: Partido }) {
  const disciplina = buscarDisciplina(partido.disciplina);
  const lectura = lecturaPrincipal(partido);
  const racha = rachaActual(lectura.historial);
  const otras = partido.lecturas.length - 1;

  return (
    <article
      className="flex flex-col border-y border-r border-regla border-l-[3px] bg-tinta-800 transition-colors hover:border-y-tiza-tenue/40 hover:border-r-tiza-tenue/40"
      style={{ borderLeftColor: disciplina.acento }}
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <p className="truncate text-[13px] text-tiza-tenue">{partido.torneo}</p>
        <p className="cifra shrink-0 font-display text-[15px] text-tiza-media">
          {partido.cuando} {partido.hora}
        </p>
      </div>

      <div className="space-y-1 px-4 pt-2">
        {[partido.local, partido.visitante].map((competidor) => (
          <div key={competidor.clave} className="flex items-center gap-3">
            <h3 className="flex-1 truncate font-display text-[22px] leading-tight font-semibold">
              {competidor.nombre}
            </h3>
            <TiraForma forma={competidor.forma} />
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-regla px-4 pt-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-display text-[19px] leading-tight text-tiza">
            {lectura.mercado}
          </h4>
          <SelloFuerza lectura={lectura} />
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <MedidorProbabilidad probabilidad={lectura.probabilidad} />
          <span className="cifra font-display text-[26px] leading-none font-semibold text-ambar">
            {lectura.probabilidad}%
          </span>
        </div>

        <div className="mt-3">
          <TiraFrecuencia historial={lectura.historial} />
          <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <p className="cifra text-tiza-media">
              {lectura.frecuencia.exitos} aciertos en {lectura.frecuencia.muestra}
            </p>
            <p className="cifra text-tiza-tenue">
              Cuota justa {cuotaJusta(lectura).toFixed(2)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-tiza-media">
          {lectura.nota}
        </p>

        {(partido.contexto?.length ?? 0) > 0 && (
          <div className="mt-3 border-t border-regla pt-3">
            <NotasContexto partido={partido} lectura={lectura} limite={1} compacto />
          </div>
        )}

        <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px] text-tiza-tenue">
          <p className="cifra">{describirRacha(racha)}</p>
          {otras > 0 && (
            <p className="cifra shrink-0">
              {otras === 1 ? "1 lectura más" : `${otras} lecturas más`}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
