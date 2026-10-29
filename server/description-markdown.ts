type AdfNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: AdfNode[];
  content?: AdfNode[];
};

// ADF text is literal: punctuation must not accidentally become Markdown syntax.
function escapeText(text: string): string {
  return text.replace(/([\\`*_{}\[\]<>#+.!|~-])/g, "\\$1");
}

function link(label: string, href: unknown): string {
  if (typeof href !== "string" || !/^https?:\/\//i.test(href)) return label;
  const url = href.replace(/[\s<>\\()]/g, (char) => char === "(" ? "%28" : char === ")" ? "%29" : encodeURIComponent(char));
  return `[${label}](<${url}>)`;
}

function code(text: string, block: boolean, language = ""): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(block ? 3 : 1, longest + 1));
  if (block) return `${fence}${language.replace(/[^\w+-]/g, "")}\n${text}\n${fence}`;
  const padding = /^[` ]|[` ]$/.test(text) ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function children(node: AdfNode, separator = ""): string {
  return (node.content ?? []).map(render).join(separator);
}

function literalText(node: AdfNode): string {
  if (node.type === "hardBreak") return "\n";
  return node.text ?? (node.content ?? []).map(literalText).join("");
}

function textWithMarks(node: AdfNode): string {
  const raw = node.text ?? "";
  if (!raw) return "";
  const marks = node.marks ?? [];
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  const body = raw.trim();
  if (!body) return raw;
  let result = marks.some((mark) => mark.type === "code") ? code(body, false) : escapeText(body);
  for (const mark of marks) {
    if (mark.type === "strong") result = `**${result}**`;
    if (mark.type === "em") result = `_${result}_`;
    if (mark.type === "strike") result = `~~${result}~~`;
    if (mark.type === "link") result = link(result, mark.attrs?.href);
  }
  return leading + result + trailing;
}

function list(node: AdfNode): string {
  const start = typeof node.attrs?.order === "number" ? node.attrs.order : 1;
  return (node.content ?? []).map((item, index) => {
    const marker = node.type === "orderedList" ? `${start + index}. ` : "- ";
    const content = (item.content ?? []).map((child, childIndex) => {
      const separator = childIndex === 0 ? "" : /^(bulletList|orderedList)$/.test(child.type ?? "") ? "\n" : "\n\n";
      return separator + render(child);
    }).join("");
    return marker + content.replace(/\n/g, `\n${" ".repeat(marker.length)}`);
  }).join("\n");
}

function table(node: AdfNode): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => children(cell, "\n\n")
    .replace(/\n/g, "<br>")));
  if (!rows.length) return "";
  const columns = Math.max(...rows.map((row) => row.length));
  const line = (row: string[]) => `| ${Array.from({ length: columns }, (_, index) => row[index] ?? "").join(" | ")} |`;
  // Markdown requires a header row; leave it empty when Jira starts with data cells.
  const hasHeader = node.content?.[0]?.content?.every((cell) => cell.type === "tableHeader");
  const header = hasHeader ? rows.shift()! : [];
  return [line(header), line(Array(columns).fill("---")), ...rows.map(line)].join("\n");
}

function render(node: AdfNode): string {
  switch (node.type) {
    case "text": return textWithMarks(node);
    case "hardBreak": return "  \n";
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? Math.min(6, Math.max(1, node.attrs.level)) : 2;
      return `${"#".repeat(level)} ${children(node)}`;
    }
    case "paragraph": return children(node);
    case "bulletList":
    case "orderedList": return list(node);
    case "codeBlock": return code(literalText(node), true, String(node.attrs?.language ?? ""));
    case "blockquote":
    case "panel": return children(node, "\n\n").split("\n").map((line) => `> ${line}`).join("\n");
    case "rule": return "---";
    case "table": return table(node);
    case "mention": return escapeText(String(node.attrs?.text ?? ""));
    case "emoji": return escapeText(String(node.attrs?.text ?? node.attrs?.shortName ?? ""));
    case "inlineCard":
    case "blockCard": return link(escapeText(String(node.attrs?.url ?? "")), node.attrs?.url);
    case "status": return escapeText(String(node.attrs?.text ?? ""));
    default: return children(node, "\n\n");
  }
}

/** Preserve Jira Cloud's structured description for Paseo's themed Markdown renderer. */
export function descriptionToMarkdown(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return render(value as AdfNode).trim();
}
