import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { cachedImage } from "./imageCache";

export function Picture({
  path,
  alt,
  onOpen,
  onLoad,
  actionLabel,
  thumbnail = false,
  source,
  small = false,
}: {
  onLoad?: () => void;
  actionLabel?: string;
  path: string;
  alt: string;
  onOpen?: (url: string) => void;
  thumbnail?: boolean;
  source?: string;
  small?: boolean;
}) {
  const requestPath = small
    ? path + (path.includes("?") ? "&" : "?") + "thumb=1"
    : path;
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  // Gate the rendered URL by its identity, including before the effect can run.
  const url = source || (loaded?.path === requestPath ? loaded.url : "");
  useEffect(() => {
    let live = true;
    setError(false);
    if (source) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        cachedImage(requestPath)
          .then((value) => {
            if (live) setLoaded({ path: requestPath, url: value });
          })
          .catch(() => {
            if (live) setError(true);
          });
      },
      { rootMargin: "200px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [requestPath, source, attempt]);
  const content = url ? (
    <img
      onLoad={onLoad}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  ) : (
    <span className="image-placeholder">
      <ImageIcon size={thumbnail ? 24 : 32} />
      {!thumbnail && (
        <small>{error ? tr("Image indisponible") : tr("Chargement…")}</small>
      )}
    </span>
  );
  return (
    <div ref={ref} className={thumbnail ? "picture thumbnail" : "picture"}>
      {onOpen && url ? (
        <button
          className="image-button"
          onClick={() => onOpen(small ? "" : url)}
          aria-label={actionLabel ?? tr("Agrandir {0}", [alt])}
        >
          {content}
        </button>
      ) : (
        content
      )}
      {error && !thumbnail && (
        <button
          className="retry-image"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {" "}
          {tr("Réessayer")}{" "}
        </button>
      )}
    </div>
  );
}
