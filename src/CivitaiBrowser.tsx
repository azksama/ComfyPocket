import { useEffect, useRef, useState } from "react";
import { Search, Download, LoaderCircle } from "lucide-react";
import { api } from "./api";
import { Picture } from "./Picture";
import { t } from "./i18n";

type Version = { id: number; name: string; baseModel: string; url: string };
type Item = {
  id: number;
  title: string;
  type: string;
  creator: string;
  preview: string;
  versions: Version[];
};
type Result = { items: Item[]; cursor: string | null };
function Card({
  item,
  onInstall,
  disabled,
}: {
  item: Item;
  onInstall: (url: string) => void;
  disabled: boolean;
}) {
  const [versionId, setVersionId] = useState(item.versions[0]?.id);
  const version =
    item.versions.find((v) => v.id === versionId) || item.versions[0];
  return (
    <article className="civitai-card">
      {item.preview && (
        <Picture path={item.preview} alt={item.title} thumbnail />
      )}
      <div className="civitai-card-body">
        <strong>{item.title}</strong>
        <small>
          {item.type} · {item.creator}
        </small>
        <label>
          {t("Version")}
          <select
            aria-label={t("Version de {0}", [item.title])}
            value={version?.id}
            onChange={(e) => setVersionId(Number(e.target.value))}
          >
            {item.versions.map((v) => (
              <option value={v.id} key={v.id}>
                {v.name} · {v.baseModel}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={disabled || !version}
          onClick={() => onInstall(version.url)}
        >
          <Download size={17} />
          {t("Choisir les fichiers")}
        </button>
      </div>
    </article>
  );
}
export function CivitaiBrowser({
  onInstall,
  disabled,
  token,
}: {
  onInstall: (url: string) => void;
  disabled: boolean;
  token: string;
}) {
  const [query, setQuery] = useState(""),
    [host, setHost] = useState("civitai.com"),
    [type, setType] = useState("Checkpoint"),
    [base, setBase] = useState(""),
    [sort, setSort] = useState("Most Downloaded");
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0),
    lock = useRef(false);
  const filters = JSON.stringify({ query, host, type, base, sort, token });
  useEffect(() => {
    revision.current++;
    setResult(null);
    setError("");
    setBusy(false);
    lock.current = false;
  }, [filters]);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  async function search(more = false) {
    if (lock.current) return;
    const current = ++revision.current;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<Result>("/bridge/civitai/search", {
        host,
        query,
        type,
        baseModels: base,
        sort,
        token,
        cursor: more ? result?.cursor : undefined,
      });
      if (current !== revision.current) return;
      setResult((old) => ({
        items: more
          ? [
              ...new Map(
                [...(old?.items || []), ...next.items].map((i) => [i.id, i]),
              ).values(),
            ]
          : next.items,
        cursor: next.cursor,
      }));
    } catch (e) {
      if (current === revision.current) setError(String(e));
    } finally {
      if (current === revision.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  }
  return (
    <section className="civitai-browser" aria-label={t("Catalogue Civitai")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          {t("Rechercher sur Civitai")}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Nom, style, personnage…")}
            maxLength={160}
          />
        </label>
        <div className="civitai-filters">
          <label>
            {t("Site")}
            <select value={host} onChange={(e) => setHost(e.target.value)}>
              <option>civitai.com</option>
              <option>civitai.red</option>
            </select>
          </label>
          <label>
            {t("Type")}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                "Checkpoint",
                "LORA",
                "LoCon",
                "VAE",
                "Upscaler",
                "TextualInversion",
                "Controlnet",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Modèle de base")}
            <select value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="">{t("Tous")}</option>
              {[
                "Illustrious",
                "NoobAI",
                "Pony",
                "SDXL 1.0",
                "SD 1.5",
                "SD 2.1",
                "SD 3.5L",
                "Flux.1 D",
                "Flux.1 S",
                "Anima",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Trier par")}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="Most Downloaded">
                {t("Les plus téléchargés")}
              </option>
              <option value="Newest">{t("Les plus récents")}</option>
              <option value="Highest Rated">{t("Les mieux notés")}</option>
            </select>
          </label>
        </div>
        <button className="primary" disabled={disabled || busy}>
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Search size={18} />
          )}{" "}
          {t("Rechercher")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {!result && !busy && !error && (
        <p className="muted">
          {t(
            "Explorez les modèles et leurs versions, puis installez les fichiers sur votre PC.",
          )}
        </p>
      )}
      {result && !result.items.length && (
        <p>{t("Aucun résultat pour cette recherche.")}</p>
      )}
      <div className="civitai-grid">
        {result?.items.map((item) => (
          <Card
            key={item.id}
            item={item}
            disabled={disabled}
            onInstall={onInstall}
          />
        ))}
      </div>
      {result?.cursor && (
        <button disabled={busy || disabled} onClick={() => void search(true)}>
          {busy ? t("Chargement…") : t("Afficher la suite")}
        </button>
      )}
    </section>
  );
}
