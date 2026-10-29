import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Bird, Trash2 } from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import type { SlashCommandSuggestionItem } from "@/components/block-editor";

const SCRIPT_URL = "https://platform.twitter.com/widgets.js";
const SCRIPT_TIMEOUT_MS = 8000;
const WIDGET_RENDER_TIMEOUT_MS = 8000;
let widgetsScriptPromise: Promise<void> | undefined;

type TwitterWidgets = { widgets?: { createTweet?: (id: string, target: HTMLElement) => Promise<unknown> } };

declare global { interface Window { twttr?: TwitterWidgets } }

function loadWidgetsScript(): Promise<void> {
  if (window.twttr?.widgets?.createTweet) return Promise.resolve();
  if (widgetsScriptPromise) return widgetsScriptPromise;
  widgetsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => reject(new Error("twitter_widgets_timeout")), SCRIPT_TIMEOUT_MS);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      if (error) reject(error);
      else if (window.twttr?.widgets?.createTweet) resolve();
      else reject(new Error("twitter_widgets_unavailable"));
    };
    script.addEventListener("load", () => finish(), { once: true });
    script.addEventListener("error", () => finish(new Error("twitter_widgets_unavailable")), { once: true });
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => { widgetsScriptPromise = undefined; throw error; });
  return widgetsScriptPromise;
}

export function parseTweetId(input: string): string | null {
  const value = input.trim();
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !/^(?:www\.|m\.|mobile\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return null;
    return url.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1] ?? null;
  } catch { return null; }
}

export function tweetHref(id: string): string { return `https://x.com/i/status/${id}`; }

// The widgets API can leave its promise pending forever when the post cannot be fetched
// (rate limits, blocked embeds, deleted posts), so the block must stop waiting on its own.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("twitter_widget_timeout")), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function TwitterNodeView({ node, updateAttributes, deleteNode, extension }: NodeViewProps) {
  const id = node.attrs.id as string | null;
  const loader = (extension.options as TwitterEmbedOptions).loadWidgetsScript ?? loadWidgetsScript;
  const [input, setInput] = useState("");
  const [state, setState] = useState<"empty" | "loading" | "ready" | "failed" | "invalid">(id ? "loading" : "empty");
  const [invalidInput, setInvalidInput] = useState("");
  const targetRef = useRef<HTMLDivElement>(null);
  const requestedId = useRef<string | null>(null);

  useEffect(() => {
    if (!id || requestedId.current === id) return;
    requestedId.current = id;
    let active = true;
    setState("loading");
    void loader().then(async () => {
      if (!active) return;
      if (!targetRef.current || !window.twttr?.widgets?.createTweet) { setState("ready"); return; }
      await withTimeout(window.twttr.widgets.createTweet(id, targetRef.current), WIDGET_RENDER_TIMEOUT_MS);
      if (active) setState("ready");
    }).catch(() => { if (active) setState("failed"); });
    return () => {
      active = false;
      // React re-invokes this effect on mount in development; releasing the guard here lets the
      // second run do the work instead of returning early and leaving the block loading forever.
      requestedId.current = null;
    };
  }, [id, loader]);

  const confirm = () => {
    const parsed = parseTweetId(input);
    if (!parsed) { setInvalidInput(input); setState("invalid"); return; }
    requestedId.current = null;
    setInvalidInput("");
    updateAttributes({ id: parsed });
  };
  const invalidHref = /^https?:\/\//i.test(invalidInput) ? invalidInput : tweetHref(encodeURIComponent(invalidInput));

  return createElement(NodeViewWrapper, { className: "my-3 rounded-lg border border-border bg-muted/30 p-4", "data-twitter-embed": "", "data-tweet-id": id ?? undefined },
    createElement("div", { className: "mb-2 flex justify-end" }, createElement("button", { type: "button", onClick: deleteNode, "aria-label": "Remove X embed", className: "rounded p-1 text-muted-foreground hover:bg-muted" }, createElement(Trash2, { size: 16 }))),
    state === "empty" && createElement("div", { className: "flex gap-2" },
      createElement("input", { "aria-label": "X post URL or ID", value: input, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setInput(event.target.value), placeholder: "Paste an X post URL or ID", className: "min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm" }),
      createElement("button", { type: "button", onClick: confirm, className: "rounded bg-primary px-3 py-2 text-primary-foreground" }, "Embed")),
    state === "invalid" && createElement("div", { className: "space-y-2 text-sm" },
      createElement("p", { className: "text-muted-foreground" }, "That reference could not be parsed."),
      invalidInput && createElement("a", { href: invalidHref, className: "break-all underline" }, invalidInput),
      createElement("button", { type: "button", onClick: () => setState("empty"), className: "block text-primary underline" }, "Try another")),
    state === "loading" && createElement("p", { className: "text-sm text-muted-foreground", role: "status" }, "Loading X post…"),
    id && state !== "failed" && createElement("div", { ref: targetRef, className: "twitter-tweet", "data-tweet-id": id }),
    state === "failed" && createElement("div", { className: "space-y-1 text-sm" },
      createElement("a", { href: tweetHref(id!), className: "break-all underline" }, tweetHref(id!)),
      createElement("p", { className: "text-muted-foreground" }, "The X post embed could not load.")),
  );
}

export interface TwitterEmbedOptions { loadWidgetsScript?: () => Promise<void> }

export const TwitterEmbed = Node.create<TwitterEmbedOptions>({
  name: "twitterEmbed", group: "block", atom: true,
  addOptions() { return { loadWidgetsScript }; },
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tweet-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-tweet-id": attributes.id } : {}),
      },
    };
  },
  parseHTML() { return [{ tag: "div[data-twitter-embed]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes({ "data-twitter-embed": "" }, HTMLAttributes)]; },
  addNodeView() { return ReactNodeViewRenderer(TwitterNodeView); },
});

export function createTwitterSlashItem(): SlashCommandSuggestionItem {
  return {
    id: "twitter", title: "X (Twitter)", description: "Embed an X or Twitter post.",
    icon: createElement(Bird, { size: 16 }), keywords: ["twitter", "x", "tweet", "post"],
    command({ editor, range }) {
      editor.chain().focus().deleteRange(range).insertContent({ type: "twitterEmbed", attrs: { id: null } }).run();
    },
  };
}
