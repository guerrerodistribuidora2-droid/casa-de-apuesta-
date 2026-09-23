import Tablero from "@/components/Tablero";
import { alcancePorFiltro, recomendaciones } from "@/lib/analista";
import { obtenerPartidos } from "@/lib/apiConnector";
import { fusionar, obtenerNoticias } from "@/lib/noticias";

/**
 * Componente de servidor: pide los partidos al adaptador (que cae a los datos
 * locales si la API no responde) y puntúa todas las lecturas durante el
 * prerender. `Tablero` solo recibe el resultado y lo filtra en el navegador.
 */
export default async function Dashboard() {
  const fuente = await obtenerPartidos();

  // Las noticias se pegan encima de los partidos ya enriquecidos con cuotas.
  const noticias = await obtenerNoticias(fuente.partidos);
  const partidos = fusionar(fuente.partidos, noticias.porPartido);

  const resumen = {
    partidos: partidos.length,
    lecturas: partidos.reduce((suma, p) => suma + p.lecturas.length, 0),
  };
  const recomendadas = recomendaciones(partidos);
  const alcances = alcancePorFiltro(partidos);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-regla py-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl leading-none font-bold tracking-tight sm:text-4xl">
            Casa de Apuesta
          </h1>
          <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-tiza-media">
            Cada mercado se juzga contando: cuántas veces se cumplió, cuándo, y qué
            tan lejos queda la estimación del modelo de esa cuenta.
          </p>
        </div>

        <dl className="flex shrink-0 gap-6">
          <Total etiqueta="Partidos" valor={resumen.partidos} />
          <Total etiqueta="Lecturas" valor={resumen.lecturas} />
          <Total etiqueta="Recomendadas" valor={recomendadas.length} destacar />
        </dl>
      </header>

      <main className="pt-6 pb-16">
        <Tablero
          partidos={partidos}
          recomendaciones={recomendadas}
          alcances={alcances}
        />
      </main>

      <footer className="border-t border-regla py-6 text-[13px] leading-relaxed text-tiza-tenue">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="cifra">
            <span className="text-tiza-media">
              {fuente.origen === "hibrido"
                ? "Cuotas en directo"
                : fuente.origen === "api"
                  ? "The Odds API"
                  : "Datos locales"}
            </span>
            {fuente.origen === "hibrido" &&
              ` · ${fuente.lecturasEnriquecidas} ${fuente.lecturasEnriquecidas === 1 ? "mercado" : "mercados"} con precio real de ${fuente.partidosEmparejados} ${fuente.partidosEmparejados === 1 ? "encuentro" : "encuentros"}`}
            {fuente.motivo ? ` · ${fuente.motivo}` : ""}
          </p>
          {fuente.peticionesRestantes !== undefined && (
            <p className="cifra">{fuente.peticionesRestantes} peticiones restantes</p>
          )}
          {fuente.proveedores.map((p) => (
            <p key={p.nombre} className="cifra">
              {p.nombre}: {p.estado}
            </p>
          ))}
          <p className="cifra">
            Prensa: {noticias.diagnostico.feedsLeidos}/
            {noticias.diagnostico.feedsTotales} feeds,{" "}
            {noticias.diagnostico.titularesLeidos} titulares,{" "}
            {noticias.diagnostico.contextosGenerados} factores
          </p>
        </div>
        <p className="mt-2 max-w-[70ch]">
          Datos simulados para maquetar la interfaz. Ninguna cifra corresponde a un
          registro real y nada de lo que aparece aquí es una recomendación para
          apostar.
        </p>
      </footer>
    </div>
  );
}

function Total({
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
        className={`cifra font-display text-[32px] leading-none font-semibold ${
          destacar ? "text-ambar" : "text-tiza"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
