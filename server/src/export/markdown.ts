type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function childNodes(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter((node): node is JsonObject => node !== undefined) : [];
}

function nodeText(node: JsonObject): string {
  return (typeof node.text === "string" ? node.text : "") + childNodes(node.content).map(nodeText).join("");
}

function markedText(text: string, value: unknown): string {
  let result = text;
  for (const mark of childNodes(value)) {
    switch (mark.type) {
      case "bold":
        result = `**${result}**`;
        break;
      case "italic":
        result = `*${result}*`;
        break;
      case "strike":
        result = `~~${result}~~`;
        break;
      case "code":
        result = `\`${result}\``;
        break;
      case "link": {
        const href = asObject(mark.attrs)?.href;
        if (typeof href === "string") result = `[${result}](${href})`;
        break;
      }
      default:
        break;
    }
  }
  return result;
}

function renderInline(value: unknown): string {
  return childNodes(value).map((node) => {
    if (node.type === "hardBreak") return "  \n";
    if (node.type === "text") {
      return markedText(typeof node.text === "string" ? node.text : "", node.marks);
    }
    return nodeText(node);
  }).join("");
}

function renderList(node: JsonObject, indent = ""): string {
  const attrs = asObject(node.attrs);
  const requestedStart = attrs?.start;
  const start = typeof requestedStart === "number" && Number.isInteger(requestedStart) ? requestedStart : 1;
  const ordered = node.type === "orderedList";
  const items = childNodes(node.content).filter((child) => child.type === "listItem");

  return items.map((item, index) => {
    const marker = ordered ? `${start + index}. ` : "- ";
    const prefix = indent + marker;
    const continuation = " ".repeat(prefix.length);
    const itemBlocks = childNodes(item.content);
    if (itemBlocks.length === 0) return prefix.trimEnd();

    const lines: string[] = [];
    let hasFirstBlock = false;
    for (const block of itemBlocks) {
      if (block.type === "bulletList" || block.type === "orderedList") {
        if (!hasFirstBlock) {
          lines.push(prefix.trimEnd());
          hasFirstBlock = true;
        }
        lines.push(renderList(block, continuation));
        continue;
      }

      const rendered = renderBlock(block);
      const renderedLines = rendered.split("\n");
      if (!hasFirstBlock) {
        lines.push(prefix + (renderedLines.shift() ?? ""));
        hasFirstBlock = true;
      }
      lines.push(...renderedLines.map((line) => continuation + line));
    }
    return lines.join("\n");
  }).join("\n");
}

function renderBlock(node: JsonObject): string {
  switch (node.type) {
    case "doc":
      return renderBlocks(node.content);
    case "paragraph":
      return renderInline(node.content);
    case "heading": {
      const level = asObject(node.attrs)?.level;
      const depth = typeof level === "number" && Number.isInteger(level) ? Math.max(1, Math.min(level, 6)) : 1;
      return `${"#".repeat(depth)} ${renderInline(node.content)}`;
    }
    case "bulletList":
    case "orderedList":
      return renderList(node);
    case "blockquote": {
      const quote = renderBlocks(node.content);
      return quote.split("\n").map((line) => `> ${line}`).join("\n");
    }
    case "codeBlock": {
      const language = asObject(node.attrs)?.language;
      const info = typeof language === "string" ? language.replace(/[\r\n]/g, "") : "";
      const code = childNodes(node.content).map(nodeText).join("");
      const longestFence = Math.max(0, ...Array.from(code.matchAll(/`+/g), ([fence]) => fence.length));
      const fence = "`".repeat(Math.max(3, longestFence + 1));
      return `${fence}${info}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    default:
      return nodeText(node);
  }
}

function renderBlocks(value: unknown): string {
  return childNodes(value).map(renderBlock).join("\n\n");
}

export function toMarkdown(content: unknown): string {
  const document = asObject(content);
  if (!document) return "";
  if (document.type === "doc") return renderBlocks(document.content);
  return renderBlock(document);
}

export function exportFilename(title: string): string {
  const safeTitle = title
    .replace(/[\\/'"\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
  return `${safeTitle || "untitled"}.md`;
}
