import { act, cleanup, render, screen } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwitterSlashItem, parseTweetId, TwitterEmbed } from "./index";

afterEach(cleanup);

function MountedEditor({ content, loader }: { content: JSONContent; loader?: () => Promise<void> }) {
  const extension = loader ? TwitterEmbed.configure({ loadWidgetsScript: loader }) : TwitterEmbed;
  const editor = useEditor({ extensions: [StarterKit, extension], content, immediatelyRender: false });
  return <EditorContent editor={editor} />;
}

const emptyTwitter: JSONContent = { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: null } }] };

describe("Twitter embed", () => {
  it.each([
    ["https://x.com/user/status/123", "123"],
    ["https://www.x.com/user/status/1", "1"],
    ["https://m.x.com/user/status/2", "2"],
    ["https://mobile.twitter.com/user/status/3", "3"],
    ["https://x.com/user/status/123?ref=abc", "123"],
    ["https://twitter.com/user/status/456", "456"],
    ["https://twitter.com/user/status/456?ref=abc", "456"],
    ["789", "789"],
    ["junk", null],
    ["https://x.com/user/status/not-numeric", null],
    ["https://example.com/user/status/123", null],
  ])("parses %s", (input, expected) => expect(parseTweetId(input)).toBe(expected));

  it("slash item inserts one empty twitterEmbed node", () => {
    const editor = new Editor({ extensions: [StarterKit, TwitterEmbed], content: "hello /twitter" });
    const item = createTwitterSlashItem();
    item.command({ editor, range: { from: 7, to: 15 } });
    expect(editor.getJSON().content?.filter((node) => node.type === "twitterEmbed")).toHaveLength(1);
    expect(editor.getJSON().content?.find((node) => node.type === "twitterEmbed")?.attrs).toEqual({ id: null });
    editor.destroy();
  });

  it("renders the link fallback when the widget loader rejects", async () => {
    const loader = vi.fn(async () => { throw new Error("blocked"); });
    const content: JSONContent = { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "123" } }] };
    render(<MountedEditor content={content} loader={loader} />);
    const fallback = await screen.findByRole("link", { name: "https://x.com/i/status/123" });
    expect(fallback.getAttribute("href")).toBe("https://x.com/i/status/123");
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("replaces loading with the embed container after one lazy load", async () => {
    let resolve!: () => void;
    const loader = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const content: JSONContent = { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "123" } }] };
    const { container } = render(<MountedEditor content={content} loader={loader} />);
    expect(await screen.findByText(/loading/i)).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(container.querySelector(".twitter-tweet")).not.toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    const createTweet = vi.fn(async (_id: string, _target: HTMLElement) => undefined);
    window.twttr = { widgets: { createTweet } };
    // Rerender a second instance whose widget callback can verify its target is mounted.
    cleanup();
    const secondLoader = vi.fn(async () => undefined);
    const second = render(<MountedEditor content={content} loader={secondLoader} />);
    await screen.findByText(/loading/i);
    await act(async () => { await Promise.resolve(); });
    expect(createTweet).toHaveBeenCalledTimes(1);
    expect(createTweet).toHaveBeenCalledWith("123", expect.any(HTMLElement));
    expect(second.container.contains(createTweet.mock.calls[0]?.[1] as HTMLElement)).toBe(true);
    delete window.twttr;
  });

  it("falls back when the default widget script loader times out", async () => {
    vi.useFakeTimers();
    const append = vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
    const content: JSONContent = { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "321" } }] };
    render(<MountedEditor content={content} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(8001); await Promise.resolve(); });
    const fallback = screen.getByRole("link", { name: "https://x.com/i/status/321" });
    expect(fallback.getAttribute("href")).toBe("https://x.com/i/status/321");
    expect(screen.queryByText(/loading/i)).toBeNull();
    const appendedScript = append.mock.calls[0]?.[0] as HTMLScriptElement;
    expect(appendedScript.src).toBe("https://platform.twitter.com/widgets.js");
    append.mockRestore();
    vi.useRealTimers();
  });

  it("falls back to the link when the widget never finishes rendering", async () => {
    vi.useFakeTimers();
    const createTweet = vi.fn(() => new Promise<unknown>(() => undefined));
    window.twttr = { widgets: { createTweet } };
    const loader = vi.fn(async () => undefined);
    const content: JSONContent = { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "123" } }] };
    render(<MountedEditor content={content} loader={loader} />);
    await act(async () => { await Promise.resolve(); });
    expect(createTweet).toHaveBeenCalledTimes(1);

    // The widgets API never settles here, which is what a rate-limited or blocked embed does.
    await act(async () => { await vi.advanceTimersByTimeAsync(8001); await Promise.resolve(); });

    expect(screen.queryByText(/loading/i)).toBeNull();
    const fallback = screen.getByRole("link", { name: "https://x.com/i/status/123" });
    expect(fallback.getAttribute("href")).toBe("https://x.com/i/status/123");
    delete window.twttr;
    vi.useRealTimers();
  });

  it("round-trips the id through serialized HTML, not only JSON", () => {    const first = new Editor({ extensions: [StarterKit, TwitterEmbed], content: { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "123" } }] } });
    const html = first.getHTML();
    const second = new Editor({ extensions: [StarterKit, TwitterEmbed], content: html });
    expect(second.getJSON().content?.[0]?.attrs?.id).toBe("123");
    first.destroy();
    second.destroy();
  });

  it("marks the rendered node so a DOM copy carries the id", async () => {
    const loader = vi.fn(async () => undefined);
    const content: JSONContent = { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "123" } }] };
    const { container } = render(<MountedEditor content={content} loader={loader} />);
    await screen.findByText(/loading/i);
    expect(container.querySelector("[data-twitter-embed]")?.getAttribute("data-tweet-id")).toBe("123");
  });

  it("round-trips the id through editor JSON", () => {
    const first = new Editor({ extensions: [StarterKit, TwitterEmbed], content: { type: "doc", content: [{ type: "twitterEmbed", attrs: { id: "123" } }] } });
    const saved = first.getJSON();
    const second = new Editor({ extensions: [StarterKit, TwitterEmbed], content: saved });
    expect(second.getJSON().content?.[0]?.attrs?.id).toBe("123");
    first.destroy();
    second.destroy();
  });
});
