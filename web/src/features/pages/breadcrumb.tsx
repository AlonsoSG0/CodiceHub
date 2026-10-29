import { Link } from "react-router-dom";
import type { PageMeta } from "@/lib/api";
import { getAncestorChain } from "./tree";
import { useT } from "@/i18n";

type BreadcrumbProps = {
  pages: PageMeta[];
  pageId: string | null;
  section: string;
};

const sectionRoots: Record<string, string> = {
  Notes: "/notes",
  Notas: "/notes",
};

export function Breadcrumb({ pages, pageId, section }: BreadcrumbProps) {
  const { t } = useT();
  const chain = pageId ? getAncestorChain(pages, pageId) : [];
  const currentPage = chain.at(-1);
  const ancestors = chain.slice(0, -1);
  const currentTitle = currentPage?.title || (pageId ? t("notes.page") : section);

  return (
    <nav aria-label={t("notes.breadcrumb")}>
      <ol className="breadcrumb">
        <li>{t("notes.workspace")}</li>
        {pageId ? (
          <li className="breadcrumb-part flex items-center gap-2">
            <span aria-hidden="true" className="text-muted-foreground">/</span>
            {sectionRoots[section] ? (
              <Link className="text-muted-foreground hover:text-foreground" to={sectionRoots[section]}>{section}</Link>
            ) : <span>{section}</span>}
          </li>
        ) : null}
        {ancestors.map((page) => (
          <li className="breadcrumb-part flex items-center gap-2" key={page.id}>
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <Link className="text-muted-foreground hover:text-foreground" to={`/notes/${page.id}`}>
              {page.title || t("notes.untitled")}
            </Link>
          </li>
        ))}
        <li className="breadcrumb-part breadcrumb-current flex items-center gap-2" aria-current="page">
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          {currentTitle}
        </li>
      </ol>
    </nav>
  );
}
