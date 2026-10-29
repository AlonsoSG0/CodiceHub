import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import { NoteEditor } from "./note-editor";

vi.mock("@floating-ui/dom", () => ({
  computePosition: async () => ({ x: 0, y: 0, strategy: "absolute" }),
  flip: () => ({}),
  shift: () => ({}),
}));

if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};

const emptyDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function dispatchImageEvent(editor: HTMLElement, type: "paste" | "drop", file: File): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const dataTransfer = {
    files: [file],
    items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    getData: () => "",
  };
  Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", { value: dataTransfer });
  editor.dispatchEvent(event);
}

function expectImageDocument(onChange: ReturnType<typeof vi.fn>, url: string): void {
  const document = onChange.mock.lastCall?.[0] as JSONContent | undefined;
  expect(document).toBeDefined();
  expect(document?.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "image", attrs: expect.objectContaining({ src: url }) }),
    ]),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NoteEditor placeholder", () => {
  it("shows the placeholder only on the empty block that holds the cursor", async () => {
    const twoEmptyParagraphs: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph" }, { type: "paragraph" }],
    };

    render(<NoteEditor value={twoEmptyParagraphs} onChange={vi.fn()} />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });

    const paragraphs = [...editor.querySelectorAll("p")];
    const marked = paragraphs.filter(
      (paragraph) => paragraph.getAttribute("data-placeholder") === "Start writing, or type / for a command…",
    );

    expect(paragraphs).toHaveLength(2);
    expect(marked).toHaveLength(1);
  });
});

describe("NoteEditor slash menu", () => {
  it("inserts an image from a URL typed into the shared prompt", async () => {
    const onChange = vi.fn();
    render(<NoteEditor value={emptyDocument} onChange={onChange} />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });
    editor.innerHTML = "<p>/picture</p>";
    fireEvent.input(editor, { inputType: "insertText", data: "/picture" });

    fireEvent.click(await screen.findByRole("button", { name: /Picture from URL/ }));

    const dialog = await screen.findByRole("dialog", { name: "Image from URL" });
    const field = within(dialog).getByRole("textbox");
    fireEvent.change(field, { target: { value: "https://example.com/cat.png" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(JSON.stringify(onChange.mock.lastCall?.[0] ?? {})).toContain("https://example.com/cat.png"),
    );
  });

  it("toggles highlight with Mod-Shift-h", async () => {
    let captured: Editor | null = null;
    render(
      <NoteEditor
        value={{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hola" }] }] }}
        onChange={vi.fn()}
        onEditorReady={(editor) => {
          captured = editor;
        }}
      />,
    );
    await screen.findByRole("textbox", { name: "Page content" });
    await waitFor(() => expect(captured).not.toBeNull());
    act(() => {
      captured!.commands.selectAll();
    });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Page content" }), {
      key: "h",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(captured!.isActive("highlight")).toBe(true));
  });

  it("inserts a star character from the slash menu", async () => {
    const onChange = vi.fn();
    render(<NoteEditor value={emptyDocument} onChange={onChange} />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });
    editor.innerHTML = "<p>/star</p>";
    fireEvent.input(editor, { inputType: "insertText", data: "/star" });

    fireEvent.click(await screen.findByRole("button", { name: /Star/ }));

    expect(JSON.stringify(onChange.mock.lastCall?.[0] ?? {})).toContain("⭐");
  });
});

describe("NoteEditor image upload", () => {
  it.each(["paste", "drop"] as const)("uploads an image exactly once on %s and reports the returned URL", async (type) => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", { type: "image/png" });
    const uploadImage = vi.fn(async () => "/uploads/generated.png");
    const onChange = vi.fn();
    render(<NoteEditor value={emptyDocument} onChange={onChange} uploadImage={uploadImage} />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });

    await act(async () => {
      dispatchImageEvent(editor, type, file);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(uploadImage).toHaveBeenCalledWith(file);
    expectImageDocument(onChange, "/uploads/generated.png");
  });

  it("offers an Image slash command and inserts the uploaded image URL", async () => {
    const uploadImage = vi.fn(async () => "/uploads/slash-image.png");
    const onChange = vi.fn();
    const { container } = render(<NoteEditor value={emptyDocument} onChange={onChange} uploadImage={uploadImage} />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });
    editor.innerHTML = "<p>/image</p>";
    fireEvent.input(editor, { inputType: "insertText", data: "/image" });

    fireEvent.click(await screen.findByRole("button", { name: /Image/ }));
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "chosen.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });

    await act(async () => {
      fireEvent.change(fileInput!);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(uploadImage).toHaveBeenCalledWith(file);
    expectImageDocument(onChange, "/uploads/slash-image.png");
  });

  it("shows a rejected upload error and inserts no image", async () => {
    const file = new File(["not actually an image"], "bad.svg", { type: "image/svg+xml" });
    const uploadImage = vi.fn(async () => {
      throw new Error("unsupported_media_type");
    });
    const onChange = vi.fn();
    render(<NoteEditor value={emptyDocument} onChange={onChange} uploadImage={uploadImage} />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });

    await act(async () => {
      dispatchImageEvent(editor, "paste", file);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole("alert")).textContent).toBe("Image upload failed: unsupported_media_type");
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.querySelector("img")).toBeNull();
  });
});
