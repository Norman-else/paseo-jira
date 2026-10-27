import assert from "node:assert/strict";
import { test } from "node:test";
import { descriptionToText } from "./server/description.ts";

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
