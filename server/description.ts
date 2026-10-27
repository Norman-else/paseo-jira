type AdfNode = {
  type?: string;
  text?: string;
  content?: unknown;
  attrs?: Record<string, unknown>;
};

const blockNodes = new Set([
  "blockquote",
  "bulletList",
  "codeBlock",
  "doc",
  "heading",
  "listItem",
  "orderedList",
  "panel",
  "paragraph",
  "rule",
  "table",
]);

function isNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null;
}

function renderChildren(node: AdfNode, separator: string): string {
  return Array.isArray(node.content) ? node.content.map(render).filter(Boolean).join(separator) : "";
}

function render(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (!isNode(value)) return "";

  if (value.type === "text") return value.text ?? "";
  if (value.type === "hardBreak") return "\n";
  if (value.type === "mention") return typeof value.attrs?.text === "string" ? value.attrs.text : "";
  if (value.type === "emoji") return typeof value.attrs?.shortName === "string" ? value.attrs.shortName : "";
  if (value.type === "inlineCard") return typeof value.attrs?.url === "string" ? value.attrs.url : "";

  switch (value.type) {
    case "paragraph":
    case "heading":
    case "codeBlock":
      return renderChildren(value, "");
    case "listItem":
      return renderChildren(value, "\n");
    case "bulletList":
      return Array.isArray(value.content)
        ? value.content.map((item) => `- ${render(item)}`).filter((item) => item !== "- ").join("\n")
        : "";
    case "orderedList":
      return Array.isArray(value.content)
        ? value.content.map((item, index) => `${index + 1}. ${render(item)}`).filter((item) => !/^\d+\. $/.test(item)).join("\n")
        : "";
    case "rule":
      return "---";
    default: {
      const children = Array.isArray(value.content) ? value.content : [];
      return renderChildren(value, children.some((child) => isNode(child) && blockNodes.has(child.type ?? "")) ? "\n\n" : "");
    }
  }
}

export function descriptionToText(value: unknown): string {
  return typeof value === "string" ? value : render(value).trim();
}
