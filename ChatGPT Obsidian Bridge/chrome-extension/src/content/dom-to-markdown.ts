function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdown(normalizeText(node.textContent ?? ""));
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const children = Array.from(node.childNodes).map((child) => inlineText(child)).join("");

  switch (node.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return `**${children}**`;
    case "em":
    case "i":
      return `*${children}*`;
    case "code":
      return `\`${(node.textContent ?? "").replace(/`/g, "\\`")}\``;
    case "a": {
      const href = node.getAttribute("href") ?? "";
      return href ? `[${children || href}](${href})` : children;
    }
    case "br":
      return "\n";
    default:
      return children;
  }
}

function blockToMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdown(normalizeText(node.textContent ?? ""));
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const childBlocks = Array.from(node.childNodes)
    .map((child) => blockToMarkdown(child, depth + 1))
    .filter(Boolean);

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number.parseInt(tag.slice(1), 10);
      return `${"#".repeat(level)} ${inlineText(node).trim()}\n\n`;
    }
    case "p":
      return `${inlineText(node).trim()}\n\n`;
    case "div": {
      const ownText = inlineText(node).trim();
      const hasBlockChildren = Array.from(node.children).some((child) =>
        ["div", "p", "pre", "ul", "ol", "blockquote", "table"].includes(child.tagName.toLowerCase())
      );

      if (hasBlockChildren) {
        return `${childBlocks.join("").trim()}\n\n`;
      }

      return ownText ? `${ownText}\n\n` : childBlocks.join("");
    }
    case "ul":
      return `${Array.from(node.children)
        .map((child) => `- ${inlineText(child).trim()}`)
        .join("\n")}\n\n`;
    case "ol":
      return `${Array.from(node.children)
        .map((child, index) => `${index + 1}. ${inlineText(child).trim()}`)
        .join("\n")}\n\n`;
    case "blockquote":
      return `${inlineText(node)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    case "pre": {
      const codeElement = node.querySelector("code");
      const language =
        codeElement?.className.match(/language-([a-z0-9_-]+)/i)?.[1] ??
        node.getAttribute("data-language") ??
        "";
      const code = codeElement?.textContent ?? node.textContent ?? "";
      return `\`\`\`${language}\n${code.replace(/\s+$/, "")}\n\`\`\`\n\n`;
    }
    case "hr":
      return "---\n\n";
    case "table":
      return `${inlineText(node).trim()}\n\n`;
    default: {
      if (childBlocks.length > 0) {
        return childBlocks.join(tag === "div" || depth === 0 ? "" : "\n");
      }
      return inlineText(node).trim();
    }
  }
}

export function domToMarkdown(root: HTMLElement): string {
  const markdown = Array.from(root.childNodes)
    .map((node) => blockToMarkdown(node))
    .filter(Boolean)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return markdown || normalizeText(root.innerText).trim();
}
