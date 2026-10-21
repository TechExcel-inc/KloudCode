// @ts-nocheck
import * as mod from "./markdown"
import { create } from "../storybook/scaffold"
import { markdown } from "../storybook/fixtures"

const docs = `### Overview
Render sanitized Markdown with code blocks, inline code, and safe links.

Pair with \`Code\` for standalone code views.

### API
- Required: \`text\` Markdown string.
- Uses the Marked context provider for parsing and sanitization.

### Variants and states
- Code blocks include copy buttons when rendered.

### Behavior
- Sanitizes HTML and auto-converts inline URL code to links.
- Adds copy buttons to code blocks.

### Accessibility
- Copy buttons include aria-labels from i18n.
- TODO: confirm link target behavior in sanitized output.

### Theming/tokens
- Uses \`data-component="markdown"\` and related slots for styling.

`

const story = create({
  title: "UI/Markdown",
  mod,
  args: {
    text: markdown,
  },
})

export default {
  title: "UI/Markdown",
  id: "components-markdown",
  component: story.meta.component,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Basic = story.Basic

const svg = (fill: string, shape: string) =>
  "```svg\n" + `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fill}"/>${shape}</svg>` + "\n```"

export const Images = {
  args: {
    text: [
      "Here are three EAD icon options:",
      "",
      "**Option A**, **Option B**, **Option C**",
      "",
      svg("#1f6feb", '<text x="32" y="41" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">EAD</text>'),
      svg("#0e7c66", '<circle cx="32" cy="32" r="16" fill="none" stroke="#fff" stroke-width="5"/>'),
      svg("#b5482a", '<path d="M18 46 32 16 46 46Z" fill="#fff"/>'),
      "",
      "A file outside the project is not shown: ![icon](/tmp/icons/a.svg)",
    ].join("\n"),
  },
}
