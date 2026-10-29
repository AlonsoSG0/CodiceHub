import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentStats, UrlPrompt } from "./index";

afterEach(() => {
  cleanup();
});

describe("DocumentStats", () => {
  it("counts words and characters across paragraphs and lists and updates with the document", () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "two words" }] },
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "three" }] }] },
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "four" }] }] },
            ],
          },
        ],
      },
    });
    const view = render(<DocumentStats editor={editor} />);
    expect(view.container.textContent).toBe("4 words · 18 characters");

    act(() => {
      editor.commands.setContent("<p>one</p><p>updated</p>");
    });
    expect(view.container.textContent).toBe("2 words · 10 characters");
    editor.destroy();
  });

  it("renders nothing when the editor is null", () => {
    const view = render(<DocumentStats editor={null} />);
    expect(view.container.innerHTML).toBe("");
  });
});

describe("UrlPrompt", () => {
  const defaults = {
    open: true,
    title: "Add link",
    description: "Enter a URL",
    initialValue: "https://example.com",
    confirmLabel: "Apply link",
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("renders nothing when closed", () => {
    const view = render(<UrlPrompt {...defaults} open={false} />);
    expect(view.container.innerHTML).toBe("");
  });

  it("focuses and selects the initial URL, and Escape cancels", () => {
    const onCancel = vi.fn();
    render(<UrlPrompt {...defaults} onCancel={onCancel} />);
    const input = screen.getByRole("textbox");
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(defaults.initialValue.length);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms the typed URL once on Enter", () => {
    const onConfirm = vi.fn();
    render(<UrlPrompt {...defaults} onConfirm={onConfirm} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "https://typed.example/path" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("https://typed.example/path");
  });

  it.each(["", "   \n  "])("does not confirm an empty URL value %j", (value) => {
    const onConfirm = vi.fn();
    render(<UrlPrompt {...defaults} initialValue={value} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply link" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
