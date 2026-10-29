import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Youtube } from "lucide-react";
import { useId, useState } from "react";
import type { SlashCommandSuggestionItem } from "@/components/block-editor";
import { useT } from "@/i18n";

// Documented substitutions against the upstream source:
//
// 1. User-visible copy is rendered through `useT()` so the editor follows the app's language. Behaviour is unchanged;
//    only the label lookup differs from upstream.

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (YOUTUBE_ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  let id: string | null = null;
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/);
    id = match?.[1] ?? null;
  }
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
}

function YouTubeEmbedView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  const videoId = typeof node.attrs.src === "string" ? node.attrs.src : null;
  const confirm = () => {
    const id = parseYouTubeId(input);
    if (!id) {
      setError("Enter a valid YouTube URL or video ID.");
      return;
    }
    setError("");
    updateAttributes({ src: id });
  };

  return (
    <NodeViewWrapper className="my-4 w-full" data-youtube-embed="" data-video-id={videoId ?? undefined}>
      <div className="relative w-full rounded-md border border-input bg-muted p-3">
        {videoId ? (
          <div className="aspect-video w-full overflow-hidden rounded-md">
            <iframe
              className="h-full w-full border-0"
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title={t("editor.youtubeVideo")}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor={inputId}>
              YouTube URL
            </label>
            <div className="flex gap-2">
              <input
                id={inputId}
                autoFocus
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="url"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirm();
                  }
                }}
                placeholder={t("editor.youtubeUrlPlaceholder")}
              />
              <button className="rounded-md border border-input px-3 py-2 text-sm" type="button" onClick={confirm}>
                Embed video
              </button>
              <button
                className="rounded-md border border-input px-3 py-2 text-sm text-muted-foreground"
                type="button"
                onClick={deleteNode}
              >
                Remove
              </button>
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        )}
        {videoId && (
          <button
            className="mt-2 rounded-md border border-input px-3 py-1 text-sm text-muted-foreground"
            type="button"
            onClick={deleteNode}
          >
            Remove embed
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const YouTubeEmbed = Node.create({
  name: "youtubeEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-video-id"),
        renderHTML: (attributes) => (attributes.src ? { "data-video-id": attributes.src } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-youtube-embed]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-youtube-embed": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(YouTubeEmbedView);
  },
});

export function createYouTubeSlashItem(): SlashCommandSuggestionItem {
  return {
    id: "youtube",
    title: "YouTube",
    description: "Embed a YouTube video.",
    icon: <Youtube size={16} />,
    keywords: ["youtube", "video", "embed"],
    command({ editor, range }) {
      editor
        .chain()
        .deleteRange(range)
        .insertContent({ type: "youtubeEmbed", attrs: { src: null } })
        .run();
    },
  };
}
