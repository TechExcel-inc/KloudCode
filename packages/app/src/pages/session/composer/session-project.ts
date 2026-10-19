import type { FilePartInput, Part, QuestionRequest, TextPartInput } from "@opencode-ai/sdk/v2"

export type ProjectSwitch = { project: string; prompt: string }

/** The project_switch call a question belongs to, or undefined for an ordinary question. */
export function projectSwitch(request: QuestionRequest, parts: Record<string, Part[] | undefined>) {
  const tool = request.tool
  if (!tool) return
  const part = parts[tool.messageID]?.find((item) => item.type === "tool" && item.callID === tool.callID)
  if (part?.type !== "tool" || part.tool !== "project_switch") return
  const input = part.state.input as Partial<ProjectSwitch>
  if (typeof input.project !== "string" || !input.project) return
  return { project: input.project, prompt: typeof input.prompt === "string" ? input.prompt : "" }
}

/** What the new session starts with: the person's own first message, or the agent's brief mid-conversation. */
export function carried(input: { fresh: boolean; parts: Part[]; prompt: string; from: string }) {
  if (!input.fresh) {
    return [{ type: "text" as const, text: `${input.prompt}\n\n(Continued from a session in ${input.from}.)` }]
  }
  return input.parts.flatMap((part): Array<TextPartInput | FilePartInput> => {
    if (part.type === "text" && !part.synthetic && part.text.trim()) return [{ type: "text", text: part.text }]
    if (part.type === "file") return [{ type: "file", mime: part.mime, url: part.url, filename: part.filename }]
    return []
  })
}
