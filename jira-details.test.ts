import assert from "node:assert/strict";
import { test } from "node:test";
import { descriptionToText } from "./server/description.ts";
import { descriptionToMarkdown } from "./server/description-markdown.ts";

const text = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: "text", text, marks });
const paragraph = (...content: ReturnType<typeof text>[]) => ({ type: "paragraph", content });
const item = (...content: object[]) => ({ type: "listItem", content });
const doc = (...content: object[]) => ({ type: "doc", version: 1, content });

test("rich descriptions retain headings, inline formatting, links and hard breaks", () => {
  assert.equal(descriptionToMarkdown(doc(
    { type: "heading", attrs: { level: 2 }, content: [text("Background")] },
    paragraph(text("Required ", [{ type: "strong" }]), text("detail", [{ type: "em" }]), text(" old", [{ type: "strike" }])),
    paragraph(text("Finix", [{ type: "link", attrs: { href: "https://example.com/a(b)" } }])),
    { type: "paragraph", content: [text("Line one"), { type: "hardBreak" }, text("Line two")] },
  )), "## Background\n\n**Required** _detail_ ~~old~~\n\n[Finix](<https://example.com/a%28b%29>)\n\nLine one  \nLine two");
});

test("rich descriptions preserve nested lists, continuation paragraphs and ordered starts", () => {
  assert.equal(descriptionToMarkdown(doc({ type: "orderedList", attrs: { order: 9 }, content: [
    item(paragraph(text("Parent")), { type: "bulletList", content: [
      item(paragraph(text("Child")), paragraph(text("More detail"))),
    ] }),
    item(paragraph(text("Next"))),
  ] })), "9. Parent\n   - Child\n     \n     More detail\n10. Next");
});

test("technical identifiers and Markdown-looking literal text remain literal", () => {
  assert.equal(descriptionToMarkdown(doc(paragraph(text("finix_payment_id < 0; *literal* [label] #tag")))),
    "finix\\_payment\\_id \\< 0; \\*literal\\* \\[label\\] \\#tag");
  assert.equal(descriptionToMarkdown(doc(paragraph(text("x ` y", [{ type: "code" }])))), "``x ` y``");
  assert.equal(descriptionToMarkdown(doc({ type: "codeBlock", attrs: { language: "sql" }, content: [text("a_b\n```\n<value>")] })),
    "````sql\na_b\n```\n<value>\n````");
});

test("quotes, tables, mentions and unknown containers keep readable content", () => {
  assert.equal(descriptionToMarkdown(doc(
    { type: "blockquote", content: [paragraph(text("Quote")), paragraph(text("More"))] },
    { type: "table", content: [
      { type: "tableRow", content: [
        { type: "tableHeader", content: [paragraph(text("Field"))] },
        { type: "tableHeader", content: [paragraph(text("Value"))] },
      ] },
      { type: "tableRow", content: [
        { type: "tableCell", content: [paragraph(text("a|b"))] },
        { type: "tableCell", content: [paragraph(text("1")), paragraph(text("2"))] },
      ] },
    ] },
    { type: "futureNode", content: [paragraph(text("Still readable"))] },
    { type: "paragraph", content: [{ type: "mention", attrs: { text: "@Norman" } }] },
  )), "> Quote\n> \n> More\n\n| Field | Value |\n| --- | --- |\n| a\\|b | 1<br><br>2 |\n\nStill readable\n\n@Norman");
});

test("missing descriptions, Markdown strings and unsafe link targets are handled", () => {
  assert.equal(descriptionToMarkdown(null), "");
  assert.equal(descriptionToMarkdown(undefined), "");
  assert.equal(descriptionToMarkdown("## Existing Markdown\n\n- Item"), "## Existing Markdown\n\n- Item");
  assert.equal(descriptionToMarkdown(doc(paragraph(text("Click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))), "Click");
});

test("descriptionToText preserves plain strings and empty descriptions", () => {
  assert.equal(descriptionToText("Plain Jira description"), "Plain Jira description");
  assert.equal(descriptionToText(null), "");
  assert.equal(descriptionToText(undefined), "");
});

test("descriptionToText separates paragraphs and preserves hard breaks", () => {
  const description = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "First line" },
          { type: "hardBreak" },
          { type: "text", text: "After break" },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
    ],
  };

  assert.equal(descriptionToText(description), "First line\nAfter break\n\nSecond paragraph");
});

test("descriptionToText renders nested bullet and ordered lists", () => {
  const description = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Parent" }] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Child" }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] },
        ],
      },
    ],
  };

  assert.equal(descriptionToText(description), "- Parent\n- Child\n\n1. One\n2. Two");
});

test("descriptionToText extracts text from unknown nodes", () => {
  const description = {
    type: "doc",
    content: [
      {
        type: "futureJiraNode",
        content: [{ type: "text", text: "Still readable" }],
      },
    ],
  };

  assert.equal(descriptionToText(description), "Still readable");
});
