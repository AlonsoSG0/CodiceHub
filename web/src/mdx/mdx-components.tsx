import type { ComponentProps } from "react";
import { MDXProvider } from "@mdx-js/react";
import { Callout } from "@/components/mdxcn/callout";

type MDXComponentMap = NonNullable<
  ComponentProps<typeof MDXProvider>["components"]
>;

export const mdxComponents: MDXComponentMap = {
  Callout,
};
