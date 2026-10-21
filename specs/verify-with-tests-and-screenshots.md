# Verify with tests and screenshots

Status: approved direction, to build next. Revised 2026-10-21: EAD Pilot is both the executor and the vision reader.

## Goal

SiCode's AI checks its own work before it says a change is done, the way Claude Code does: change the code, run the relevant tests, run the app and look at the result when the change is visible, then report what was verified and what was not. The user sees that evidence in the conversation as a short line with screenshot thumbnails.

This is an **Enterprise feature**. Each user turns it on; it is off by default.

## What the user sees

- After a change, the reply states what was checked: "Tests: 459 passed", "Checked on screen by EAD Pilot: the card shows three buttons (screenshot)", or "Not checked on screen: the feature is off" / "needs a sign-in".
- The folded actions line describes the work: "Ran 3 commands, used 6 tools", with up to three screenshot thumbnails; clicking one opens it full size.
- The AI never says "fixed" or "done" without a test result or a screen check behind it.
- In Settings, an "AI verifies changes on screen (Enterprise)" switch. When the user's company has no Enterprise edition, the switch is shown disabled with one line saying it needs Enterprise.

## Who does what

| Part | Done by | Exists today |
|---|---|---|
| Unit tests and builds | SiCode's AI, with the project's own test command | Yes (shell) |
| Start the app, click, type, navigate | EAD Pilot executor (Playwright service on the user's machine, port 8082, driven through the Pilot server `/api/ead-test`) | Yes |
| Choose each action from the screen, and judge "expected result visible?" | EAD Pilot vision (VisionRunner: next action; `verifyExpectedResultOnScreen` returns ok + evidence) | Yes, inside the executor |
| Read any image for a text-only model | EAD Pilot vision slot (LlmChatRouter readImages / messagesForBlindModel) | Yes, for images in the user's message |
| Store runs, step results, screenshots | Pilot tables `ead_test_execution` (progress_json with per-step status, actual result, before/after screenshot file names) | Yes |

## What to build

### 1. Verification habit (SiCode AI instructions)

- After changing code, run the tests that cover it; report the result in one line, with the failure if any.
- When the change is visible and the feature is on: ask EAD Pilot to check it on screen (below), then report Pilot's verdict and evidence.
- If something cannot be checked, say so instead of claiming it works.
- Keep checks proportionate: one targeted test file for a small change, the full suite before a commit.

### 2. Pilot tools SiCode can call (mcp-eadpfm)

Today SiCode can only read run results (`eadpfm_get_test_run_context`). New MCP tools, wrapping existing Pilot endpoints:

- `eadpfm_check_on_screen`: start a check run. Input: app URL (usually the local dev server the AI started), target page, and steps written as "do / expect" pairs. Wraps `POST /api/ead-test/run` in vision mode. Returns a run id.
- `eadpfm_get_check_result`: wait for or read the run: overall pass/fail, each step's verdict and evidence, screenshot links. Wraps `GET /api/ead-test/execution/{id}/progress`.
- `eadpfm_get_screenshot`: one screenshot, for the conversation thumbnails. Wraps `GET /api/ead-test/execution/{id}/screenshot`.
- Optional `eadpfm_judge_screen`: a single "is this expected result visible?" check on one screenshot. Needs a small new Pilot endpoint around `verifyExpectedResultOnScreen`.

The tools refuse with a clear message when the feature is off or the executor is not running.

### 3. Enterprise gating and the user's switch (Pilot)

Nothing in Pilot marks editions today. Add:

- An edition on the company (tenant): Standard or Enterprise, in a real table column, set by the system admin. Exposed in `/auth/me` so SiCode knows.
- The user's opt-in as a Pilot per-user setting (`personal_rt_settings`, key `sicode.verifyOnScreen`), read and written through `/api/settings`. Global for the user, not per device.
- Pilot enforces both on the new endpoints and tools, not only in the SiCode interface.

### 4. Showing it in SiCode

- Folded line label: "Ran N commands, used M tools"; while running: "Running a command", "Checking on screen with EAD Pilot".
- Up to three screenshot thumbnails from Pilot runs, then "+N"; click opens full size.
- The checklist box and the live lines stay as they are.
- The Settings switch described above.

## Gaps found in Pilot (fix as part of this work)

- Run results are not written back to the test steps (`ai_test_step.status` stays as generated).
- Screenshots live only on the executor's disk; the database stores file names. SiCode needs them by URL through Pilot, and they must survive restarts.
- Image readings are cached only in memory.
- The executor must be running on the user's machine; SiCode should detect that and explain how to start it.

## Cost and time

Each screen check uses the vision model per action and per verdict; these are gateway requests and appear in the LLM Cost Report. Verified changes cost somewhat more and take longer; fewer wrong "done" claims and repeat rounds outweigh it.

## Order of work

1. Verification habit and the folded line label (SiCode).
2. Enterprise edition and the user's switch (Pilot + SiCode Settings).
3. Pilot MCP tools for check-on-screen, result and screenshot; store screenshots retrievably.
4. Thumbnails in the conversation.

Each step is built, tested, and installed separately.
