# Verify with tests and screenshots

Status: approved design, to build next (2026-10-21).

## Goal

SiCode's AI checks its own work before it says a change is done, the way Claude Code does: it changes the code, runs the relevant tests, looks at the result on screen when the change is visible, and reports what it verified and what it did not. The user sees that evidence in the conversation as a short line with screenshot thumbnails.

## What the user sees

- After a change, the reply says plainly what was checked: "Tests: 459 passed", "Checked on screen: the card shows three buttons", or "Not checked on screen: needs a signed-in session".
- Each reply's folded actions line describes the work instead of counting it: "Ran 3 commands, used 6 tools", with up to three screenshot thumbnails at its right. Clicking a thumbnail opens the screenshot full size.
- The AI never says "fixed" or "done" without a test result or a screenshot behind it.

## Parts

### 1. Verification habit (AI instructions)

Added to the build agent's instructions:

- After changing code, run the tests that cover it (the project's own test command; find it in package.json, the README or the project's agent instructions). Report the result in one line, with the failure if any.
- When the change is visible (a page, a dialog, a layout), open it and take a screenshot before reporting. Describe what the screenshot shows.
- If something cannot be checked (needs a sign-in, a device, a production server), say so instead of claiming it works.
- Keep checks proportionate: one targeted test file for a small change, the full suite only before a commit.

### 2. A browser the AI can drive

- A browser tool built into SiCode that drives the user's installed Google Chrome (no separate browser download). Candidate: Chrome DevTools MCP, registered by default for the build agent, with its own Chrome profile so the user's browsing, sign-ins and cookies are never touched.
- Actions: open a URL (usually a local dev server the AI started), click, type, read the page text, take a screenshot.
- Local addresses (localhost, 127.0.0.1) work without asking; any other site asks the user first.
- Screenshots are saved with the session, so they stay visible after a restart.

### 3. Seeing the screenshot (EAD Pilot vision)

EAD plans already have a vision model slot. Pilot reads an image with that model and passes the reading to text-only models (DeepSeek, GLM), so every EAD plan can "see" a screenshot.

To check and likely change:

- Today Pilot reads images only from the latest user message (`prepareCursorCodingTurn` / `latestUserMessage` in LlmChatRouter). A screenshot from a tool arrives during the AI's own turn, not in a user message. Pilot must also read new images in tool results (or wherever the engine places tool-result images for OpenAI-compatible providers), reusing its existing cache so each screenshot is read once.
- The reading should describe layout and visible text in detail, because the AI uses it to judge whether the change looks right.
- Each reading is a gateway request, so it appears in the LLM Cost Report like any other request.

### 4. Showing it in the conversation

- Folded line label: "Ran N commands, used M tools" (counts by kind) instead of "N actions"; while running: "Running a command", "Taking a screenshot".
- Up to three screenshot thumbnails at the right of the folded line, then "+N". Click opens a full-size view.
- The checklist box, the live line above it and the status line below it stay as they are.

## Cost and time

Tests and screenshots add requests: each verified change costs somewhat more and takes longer. The saving is fewer wrong "done" claims and fewer repeat rounds, which outweighs it.

## Order of work

1. Verification habit (instructions) and the folded line label.
2. Pilot: read images in tool results with the vision slot; test with a DeepSeek plan.
3. Browser tool with screenshots, saved with the session.
4. Thumbnails on the folded line.

Each step is built, tested, and installed separately.
