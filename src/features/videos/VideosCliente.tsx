import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clapperboard, Loader2 } from "lucide-react";
import type { Video } from "../../types/db";
import { Badge, Segmentado } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ErrorBox } from "../../components/ui/ErrorBox";
import {
  colgado,
  crearVideo,
  useVideos,
  useVideosAutomaticos,
  type EnfoqueVideo,
} from "./useVideos";

export const ENFOQUE_VIDEO: Record<
  EnfoqueVideo,
  { label: string; ayuda: string }
> = {
  cliente: {
    label: "Para el cliente",
    ayuda:
      'Le habla al dueño del negocio: "así podría funcionar tu…". Muestra a sus clientes y cómo se organiza él.',
  },
  equipo: {
    label: "Para que lo muestre",
    ayuda:
      "Para que el cliente se lo muestre a los suyos (socios, médicos, equipo).",
  },
  interno: {
    label: "Para nosotros",
    ayuda:
      "Plan de implementación: qué le vendemos, cómo lo armamos, paso a paso, qué pedirle y qué cuidar.",
  },
};

export const ESTADO_VIDEO: Record<
  Video["estado"],
  { label: string; tono: "neutro" | "acento" | "ok" | "peligro" }
> = {
  guion: { label: "Escribiendo el guion…", tono: "acento" },
  voz: { label: "Poniendo la voz…", tono: "acento" },
  listo: { label: "Listo", tono: "ok" },
  error: { label: "Error", tono: "peligro" },
};

/**
 * "Generar video": un video explicativo con las soluciones para el cliente, a partir de una grabación o
 * intervención analizada (o de toda la carpeta). Lista los que ya hay.
 */
export function VideosCliente({
  grabacionId,
  prospectoId,
  compacto,
  puedeGenerar = true,
}: {
  grabacionId?: string | null;
  prospectoId?: string | null;
  compacto?: boolean;
  /** Sin nada analizado no hay de dónde sacar el guion: solo se listan los videos que ya hay */
  puedeGenerar?: boolean;
}) {
  const navigate = useNavigate();
  const { videos, error } = useVideos(
    grabacionId ? { grabacion_id: grabacionId } : { prospecto_id: prospectoId },
  );
  const [enfoque, setEnfoque] = useState<EnfoqueVideo>("cliente");
  const automaticos = useVideosAutomaticos();
  const [pidiendo, setPidiendo] = useState(false);
  const [errorPedido, setErrorPedido] = useState<string | null>(null);

  const generar = async () => {
    setPidiendo(true);
    setErrorPedido(null);
    try {
      const id = await crearVideo(
        {
          grabacion_id: grabacionId ?? null,
          prospecto_id: grabacionId ? null : (prospectoId ?? null),
        },
        enfoque,
      );
      navigate(`/videos/${id}`);
    } catch (e) {
      setErrorPedido(
        e instanceof Error ? e.message : "No se pudo pedir el video.",
      );
      setPidiendo(false);
    }
  };

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <Clapperboard className="size-5 text-acento-texto" />
        <h2 className="min-w-0 flex-1 text-[19px] font-bold">
          {grabacionId ? "Video explicativo" : "Videos"}
        </h2>
      </div>
      {puedeGenerar ? (
        <>
          <p className="mb-3 text-sm text-tenue">
            Claude arma un video de 1:30 a 2 min con las soluciones que le
            proponemos{grabacionId ? " a partir de esta charla" : ""}: lo que
            vive su cliente, cómo se organiza el dueño, cómo funciona y los
            beneficios, con voz y subtítulos. Y uno corto para nosotros con el
            plan de implementación.
          </p>
          <div
            className={
              compacto
                ? "flex flex-col gap-2"
                : "flex flex-wrap items-center gap-2"
            }
          >
            <Segmentado
              valor={enfoque}
              onChange={setEnfoque}
              opciones={(
                ["cliente", "equipo", "interno"] as EnfoqueVideo[]
              ).map((v) => ({ valor: v, label: ENFOQUE_VIDEO[v].label }))}
            />
            <Button onClick={generar} disabled={pidiendo}>
              {pidiendo ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Clapperboard className="size-4" />
              )}{" "}
              Generar video
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-tenue">
            {ENFOQUE_VIDEO[enfoque].ayuda}
          </p>
          {automaticos.activo !== null && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={automaticos.activo}
                onChange={(e) =>
                  automaticos
                    .cambiar(e.target.checked)
                    .catch((err) => setErrorPedido(err.message))
                }
                className="mt-0.5 size-4 accent-(--color-acento)"
              />
              <span>
                <b className="font-semibold">Armarlos solos</b>
                <span className="block text-xs text-tenue">
                  Después de cada audio, texto o reunión analizada con un
                  cliente, se arman el video para el cliente y el de "para
                  nosotros" (gasta créditos de ElevenLabs).
                </span>
              </span>
            </label>
          )}
        </>
      ) : (
        <p className="text-sm text-tenue">
          {videos.length
            ? "Los videos que armamos para este cliente."
            : "Cuando cargues una intervención o una reunión, acá vas a poder generar el video explicativo y quedan guardados."}
        </p>
      )}
      {(errorPedido || error) && (
        <div className="mt-3">
          <ErrorBox mensaje={errorPedido ?? error ?? ""} />
        </div>
      )}
      {videos.length > 0 && (
        <ul className="-mx-1 mt-3 flex flex-col border-t border-borde pt-2">
          {videos.map((v) => {
            const e = colgado(v)
              ? { label: "Se cortó", tono: "peligro" as const }
              : ESTADO_VIDEO[v.estado];
            return (
              <li key={v.id}>
                <Link
                  to={`/videos/${v.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-elevada"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {v.titulo}
                    </span>
                    <span className="text-[13px] text-tenue">
                      {ENFOQUE_VIDEO[v.enfoque ?? "cliente"]?.label ??
                        "Para el cliente"}{" "}
                      ·{" "}
                      {new Date(v.created_at).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                      })}
                      {v.pedido_por === "automático" && " · automático"}
                      {v.estado === "listo" && !v.con_voz && " · sin voz"}
                      {v.archivo_path && " · guardado"}
                    </span>
                  </span>
                  <Badge tono={e.tono}>{e.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
