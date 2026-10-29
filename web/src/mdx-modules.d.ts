// Vite compiles MDX documents with `@mdx-js/rollup` and the
// `@mdx-js/react` provider source, so every MDX document resolves its
// components from the shared map in `src/mdx/mdx-components.tsx`.
//
// MDX is a rendered-content format for docs, changelogs and READMEs. It is
// never the storage format of a note.
//
// The declaration lives here rather than in `types` because Vite's client
// types do not cover the extension.
declare module "*.mdx" {
  import type { MDXProps } from "mdx/types";
  import type { ComponentType } from "react";

  const MDXComponent: ComponentType<MDXProps>;
  export default MDXComponent;
}
