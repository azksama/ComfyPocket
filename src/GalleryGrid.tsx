import { t as tr, locale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, Download, Trash2, X, CheckSquare } from "lucide-react";
import { galleryPath, imageUrl, native, type GalleryItem } from "./api";
import { Picture, type ViewItem } from "./components";
const keyOf = (item: GalleryItem) => `${item.root}:${item.relative}`;
type Action = "trash" | "favorite" | "download";
export default function GalleryGrid({
  items,
  columns,
  scope,
  active,
  onOpen,
  onFavorite,
  onTrash,
  onNotice,
}: {
  items: GalleryItem[];
  columns: number;
  scope: string;
  active: boolean;
  onOpen: (index: number, url: string) => void;
  onFavorite: (item: ViewItem, value: boolean) => Promise<void>;
  onTrash: (item: ViewItem, silent?: boolean) => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [pendingFavorites, setPendingFavorites] = useState<Set<string>>(
    new Set(),
  );
  const favoriteLocks = useRef(new Set<string>());
  const [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [progress, setProgress] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const hold = useRef<{
      timer: ReturnType<typeof setTimeout>;
      x: number;
      y: number;
    } | null>(null),
    skipClick = useRef(false),
    operation = useRef(false),
    alive = useRef(true),
    scopeRef = useRef(scope);
  scopeRef.current = scope;
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  useEffect(() => {
    setSelected(new Set());
    setSelecting(false);
    setError("");
    cancelHold();
  }, [scope]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelHold();
    };
  }, []);
  useEffect(() => {
    const available = new Set(items.map(keyOf));
    setSelected((old) => new Set([...old].filter((key) => available.has(key))));
  }, [items]);
  const toggle = (item: GalleryItem) => {
    if (operation.current) return;
    setSelected((old) => {
      const next = new Set(old),
        key = keyOf(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const favoriteOne = async (item: GalleryItem) => {
    const key = keyOf(item);
    if (favoriteLocks.current.has(key)) return;
    favoriteLocks.current.add(key);
    setPendingFavorites(new Set(favoriteLocks.current));
    try {
      await onFavorite(
        { path: galleryPath(item), name: item.name, gallery: item },
        !item.favorite,
      );
    } catch {
      if (alive.current && scopeRef.current === scope)
        setError(tr("Le favori n’a pas pu être modifié."));
    } finally {
      favoriteLocks.current.delete(key);
      if (alive.current) setPendingFavorites(new Set(favoriteLocks.current));
    }
  };
  const action = async (kind: Action) => {
    if (operation.current || !selected.size) return;
    operation.current = true;
    setBusy(true);
    setError("");
    const snapshot = items.filter((i) => selected.has(keyOf(i))),
      failed: string[] = [];
    let done = 0;
    try {
      for (const [i, item] of snapshot.entries()) {
        if (!alive.current || scopeRef.current !== scope) break;
        setProgress(`${i + 1} / ${snapshot.length}`);
        try {
          const view = {
            path: galleryPath(item),
            name: item.name,
            gallery: item,
          };
          if (kind === "trash") await onTrash(view, true);
          if (kind === "favorite") await onFavorite(view, true);
          // Download one original at a time; never retain a batch of full-size images.
          if (kind === "download")
            await native("save_image", {
              dataUrl: await imageUrl(view.path),
              filename: item.name,
            });
          done++;
        } catch {
          failed.push(keyOf(item));
        }
      }
      if (!alive.current || scopeRef.current !== scope) return;
      if (failed.length) {
        setSelected(new Set(failed));
        setError(
          tr(
            "{0} action(s) ont échoué. Ces images restent sélectionnées pour réessayer.",
            [failed.length],
          ),
        );
      } else if (kind === "trash") {
        setSelected(new Set());
        setSelecting(false);
      }
      if (done)
        onNotice(
          tr("{0} image(s) {1}.", [
            done,
            kind === "trash"
              ? tr("déplacée(s) dans la corbeille")
              : kind === "favorite"
                ? tr("mise(s) en favori")
                : tr("enregistrée(s) sur cet appareil"),
          ]),
        );
    } finally {
      operation.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };
  return (
    <>
      <div className="gallery-selection-tools">
        <button
          aria-pressed={selecting}
          disabled={busy}
          onClick={() => {
            setSelecting((v) => !v);
            setSelected(new Set());
            setError("");
          }}
        >
          <CheckSquare size={17} />
          {selecting ? tr("Quitter la sélection") : tr("Sélectionner")}
        </button>
        {selecting && (
          <button
            disabled={busy}
            onClick={() => setSelected(new Set(items.map(keyOf)))}
          >
            {" "}
            {tr("Tout sélectionner")}{" "}
          </button>
        )}
        {selecting && (
          <small>
            {items.length} {tr("image(s) chargée(s)")}
          </small>
        )}
      </div>
      <div
        className={`gallery-grid ${selecting ? "selection-mode" : ""}`}
        data-columns={columns}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
      >
        {items.map((item, index) => (
          <article
            className={`gallery-card ${selected.has(keyOf(item)) ? "is-selected" : ""}`}
            key={keyOf(item)}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (
                busy ||
                e.button !== 0 ||
                (e.target as Element).closest("button:not(.image-button)")
              )
                return;
              skipClick.current = false;
              cancelHold();
              hold.current = {
                x: e.clientX,
                y: e.clientY,
                timer: setTimeout(() => {
                  skipClick.current = true;
                  setSelecting(true);
                  setSelected((old) => new Set(old).add(keyOf(item)));
                  hold.current = null;
                }, 450),
              };
            }}
            onPointerMove={(e) => {
              if (
                hold.current &&
                Math.hypot(
                  e.clientX - hold.current.x,
                  e.clientY - hold.current.y,
                ) > 10
              )
                cancelHold();
            }}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onClickCapture={(e) => {
              if (skipClick.current) {
                e.preventDefault();
                e.stopPropagation();
                skipClick.current = false;
              }
            }}
          >
            <Picture
              small
              path={galleryPath(item)}
              alt={item.name}
              onOpen={(url) => (selecting ? toggle(item) : onOpen(index, url))}
            />
            {selecting ? (
              <button
                className="selection-target"
                aria-label={tr("Sélectionner {0}", [item.name])}
                aria-pressed={selected.has(keyOf(item))}
                disabled={busy}
                onClick={() => toggle(item)}
              ></button>
            ) : (
              <button
                className="favorite-button"
                aria-label={`${item.favorite ? tr("Retirer des favoris") : tr("Mettre en favori")} ${item.name}`}
                aria-pressed={!!item.favorite}
                disabled={pendingFavorites.has(keyOf(item))}
                onClick={() => void favoriteOne(item)}
              >
                <Heart
                  size={18}
                  fill={item.favorite ? "currentColor" : "none"}
                />
              </button>
            )}
            <div className="gallery-caption">
              <strong>{item.name}</strong>
              <small>
                {new Date(item.modified).toLocaleDateString(locale(), {
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {item.folder}
              </small>
            </div>
          </article>
        ))}
      </div>
      {selecting &&
        active &&
        createPortal(
          <div
            className="batch-toolbar"
            role="region"
            aria-label={tr("Actions sur la sélection")}
          >
            <div>
              <strong aria-label={tr("{0} sélectionnée(s)", [selected.size])}>
                {selected.size}
                <small>{tr("sélection")}</small>
              </strong>
              <span role="status">{progress}</span>
            </div>
            <button
              aria-label={tr("Supprimer la sélection")}
              disabled={busy || !selected.size}
              onClick={() => void action("trash")}
            >
              <Trash2 size={21} />
            </button>
            <button
              aria-label={tr("Mettre la sélection en favori")}
              disabled={busy || !selected.size}
              onClick={() => void action("favorite")}
            >
              <Heart size={21} />
            </button>
            <button
              aria-label={tr("Télécharger la sélection")}
              disabled={busy || !selected.size}
              onClick={() => void action("download")}
            >
              <Download size={21} />
            </button>
            <button
              aria-label={tr("Fermer la sélection")}
              disabled={busy}
              onClick={() => {
                setSelecting(false);
                setSelected(new Set());
              }}
            >
              <X size={20} />
            </button>
          </div>,
          document.body,
        )}
      {error &&
        active &&
        createPortal(
          <p className="batch-error" role="alert">
            {error}
            <button
              aria-label={tr("Fermer l’erreur de sélection")}
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </p>,
          document.body,
        )}
    </>
  );
}
