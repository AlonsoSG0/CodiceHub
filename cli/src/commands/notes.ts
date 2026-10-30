import { countArgs, parseOptions, withData, type Command } from "../command.js";
import { call } from "../ops.js";
import { resolveNamed } from "../resolve.js";

type PageMeta = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
  updatedAt: string;
  deletedAt: string | null;
  favorite: boolean;
  sectionId: string | null;
};
type Page = PageMeta & { content: unknown };
type Backlink = { id: string; title: string; context: string };

const title = (page: { title: string }) => page.title || "Untitled";
const path = (id: string) => `/api/pages/${encodeURIComponent(id)}`;

function renderTree(pages: PageMeta[]): string {
  const children = new Map<string | null, PageMeta[]>();
  const ids = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    const parent = page.parentId !== null && ids.has(page.parentId) ? page.parentId : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(page);
    children.set(parent, siblings);
  }
  const lines: string[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const page of children.get(parent) ?? []) {
      lines.push(`${"  ".repeat(depth)}${title(page)}  ${page.id}`);
      visit(page.id, depth + 1);
    }
  };
  visit(null, 0);
  return lines.join("\n");
}

export const notes: Command = {
  name: "notes",
  lines: ["notes [--json]"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "notes");
    await withData(async (db) => {
      const result = (await call(db, "/api/pages/tree")) as { pages: PageMeta[] };
      const text = flags.json ? JSON.stringify(result, null, 2) : renderTree(result.pages);
      if (text) console.log(text);
    });
  },
};

export const note: Command = {
  name: "note",
  lines: [
    "note <page> [--json]",
    "note new [--title <t>] [--parent <page>]",
    "note rename <page> <title>",
    "note backlinks|rm|restore <page>",
  ],
  async run(argv) {
    const verb = argv[0];
    const action = verb === "new" || verb === "rename" || verb === "backlinks" || verb === "rm" || verb === "restore" ? verb : "show";
    const { args, values, flags } = parseOptions(action === "show" ? argv : argv.slice(1), action === "new" ? ["title", "parent"] : [], action === "show" ? ["json"] : []);
    countArgs(args, action === "new" ? 0 : action === "rename" ? 2 : 1, `note${action === "show" ? "" : ` ${action}`}`);
    await withData(async (db) => {
      const resolve = async (argument: string, trash = false) => {
        const result = (await call(db, `/api/pages/${trash ? "trash" : "tree"}`)) as { pages: PageMeta[] };
        return resolveNamed(result.pages, argument, (row) => row.title, "page");
      };
      if (action === "new") {
        const parent = values.parent === undefined ? undefined : await resolve(values.parent);
        const body = { ...(values.title === undefined ? {} : { title: values.title }), ...(parent === undefined ? {} : { parentId: parent.id }) };
        const page = (await call(db, "/api/pages", { method: "POST", body: JSON.stringify(body) })) as Page;
        console.log(`${title(page)}  ${page.id}`);
        return;
      }
      const page = await resolve(args[0] ?? "", action === "restore");
      if (action === "show") {
        const full = (await call(db, path(page.id))) as Page;
        if (flags.json) console.log(JSON.stringify(full, null, 2));
        else console.log(`${title(full)}\nID: ${full.id}\nParent: ${full.parentId ?? "—"}\nUpdated: ${full.updatedAt}\nFavorite: ${full.favorite ? "yes" : "no"}\nIcon: ${full.icon ?? "—"}\nSection: ${full.sectionId ?? "—"}\nPosition: ${full.position}\nDeleted: ${full.deletedAt ?? "—"}`);
      } else if (action === "rename") {
        const updated = (await call(db, path(page.id), { method: "PATCH", body: JSON.stringify({ title: args[1] }) })) as Page;
        console.log(`${title(updated)}  ${updated.id}`);
      } else if (action === "backlinks") {
        const result = (await call(db, `${path(page.id)}/backlinks`)) as { backlinks: Backlink[] };
        if (result.backlinks.length) console.log(result.backlinks.map((link) => `${title(link)}  ${link.id}${link.context ? `  ${link.context}` : ""}`).join("\n"));
      } else {
        await call(db, action === "restore" ? `${path(page.id)}/restore` : path(page.id), { method: action === "restore" ? "POST" : "DELETE" });
        console.log(`${action === "restore" ? "Restored" : "Deleted"}: ${title(page)}  ${page.id}`);
      }
    });
  },
};
