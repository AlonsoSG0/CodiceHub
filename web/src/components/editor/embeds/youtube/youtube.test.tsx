import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { createYouTubeSlashItem, parseYouTubeId, YouTubeEmbed } from "./index";

function MountedEditor({
  content,
  onReady,
}: {
  content?: JSONContent;
  onReady?: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit, YouTubeEmbed],
    content: content ?? { type: "doc", content: [{ type: "youtubeEmbed", attrs: { src: null } }] },
    onCreate: ({ editor }) => onReady?.(editor),
  });
  return <EditorContent editor={editor} />;
}

afterEach(cleanup);

describe("YouTube embeds", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abcdefghijk", "abcdefghijk"],
    ["https://youtu.be/abcdefghijk?t=30", "abcdefghijk"],
    ["https://m.youtube.com/shorts/abcdefghijk?feature=share", "abcdefghijk"],
    ["https://music.youtube.com/embed/abcdefghijk?start=2", "abcdefghijk"],
    ["https://youtube.com/live/abcdefghijk?si=abc", "abcdefghijk"],
    ["abcdefghijk", "abcdefghijk"],
    ["not a youtube reference", null],
  ])("parses %s", (input, expected) => {
    expect(parseYouTubeId(input)).toBe(expected);
  });

  it("inserts one youtubeEmbed node from the slash item", () => {
    const item = createYouTubeSlashItem();
    const editor = new Editor({
      extensions: [StarterKit, YouTubeEmbed],
      content: "<p>/youtube</p>",
    }) as Editor;
    item.command({ editor, range: { from: 1, to: 9 } });

    expect(editor.getJSON().content?.filter((node) => node.type === "youtubeEmbed")).toHaveLength(1);
    expect(editor.getJSON().content?.find((node) => node.type === "youtubeEmbed")?.attrs).toEqual({ src: null });
    editor.destroy();
  });

  it("confirms a valid URL and renders a responsive 16:9 privacy-enhanced iframe", async () => {
    render(<MountedEditor />);
    fireEvent.change(await screen.findByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/abcdefghijk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }));

    const iframe = await screen.findByTitle("YouTube video");
    expect(iframe.getAttribute("src")).toContain("youtube-nocookie.com/embed/abcdefghijk");
    expect(iframe.parentElement?.classList.contains("aspect-video")).toBe(true);
  });

  it("keeps an invalid URL available, shows an error, and renders no iframe", async () => {
    render(<MountedEditor />);
    const input = await screen.findByLabelText("YouTube URL");
    fireEvent.change(input, { target: { value: "https://example.com/nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid YouTube URL or video ID.");
    expect((screen.getByLabelText("YouTube URL") as HTMLInputElement).value).toBe("https://example.com/nope");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("round-trips the video id through editor JSON", async () => {
    let firstEditor: Editor | undefined;
    const view = render(<MountedEditor onReady={(editor) => (firstEditor = editor)} />);
    fireEvent.change(await screen.findByLabelText("YouTube URL"), {
      target: { value: "https://www.youtube.com/watch?v=abcdefghijk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }));
    await screen.findByTitle("YouTube video");

    let saved: JSONContent | undefined;
    act(() => {
      saved = firstEditor?.getJSON();
      view.unmount();
    });
    let secondEditor: Editor | undefined;
    render(<MountedEditor content={saved} onReady={(editor) => (secondEditor = editor)} />);
    await screen.findByTitle("YouTube video");
    expect(secondEditor?.getJSON().content?.filter((node) => node.type === "youtubeEmbed")).toHaveLength(1);
    expect(secondEditor?.getJSON().content?.find((node) => node.type === "youtubeEmbed")?.attrs?.src).toBe("abcdefghijk");
    expect(secondEditor?.getJSON()).toEqual(saved);
  });

  it("round-trips the video id through serialized HTML, not only JSON", () => {
    const first = new Editor({ extensions: [StarterKit, YouTubeEmbed], content: { type: "doc", content: [{ type: "youtubeEmbed", attrs: { src: "dQw4w9WgXcQ" } }] } });
    const html = first.getHTML();
    const second = new Editor({ extensions: [StarterKit, YouTubeEmbed], content: html });
    expect(second.getJSON().content?.[0]?.attrs?.src).toBe("dQw4w9WgXcQ");
    first.destroy();
    second.destroy();
  });

  it("marks the rendered node so a DOM copy carries the video id", async () => {
    render(<MountedEditor content={{ type: "doc", content: [{ type: "youtubeEmbed", attrs: { src: "dQw4w9WgXcQ" } }] }} />);
    await screen.findByTitle("YouTube video");
    expect(document.querySelector("[data-youtube-embed]")?.getAttribute("data-video-id")).toBe("dQw4w9WgXcQ");
  });
});
