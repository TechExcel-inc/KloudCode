import { t, type Lang } from "./i18n"

export type ContextKind = "jobs" | "prompt" | "skills" | "api" | "source"

export type ModalPayload = {
  contextKind: ContextKind
  nodeId: number
  nodeTitle: string
  updatedAt?: string
  payload: unknown
}

export function kindLabel(kind: ContextKind, lang: Lang = "en") {
  if (kind === "jobs") return t(lang, "kindJobs")
  if (kind === "prompt") return t(lang, "kindPrompt")
  if (kind === "skills") return t(lang, "kindSkills")
  if (kind === "api") return t(lang, "kindApi")
  return t(lang, "kindSource")
}

type Active = {
  aiPrompt?: string
  eadScript?: string
  aiApi?: string
  updatedAt?: string
  linkedSkills?: unknown[]
  sourceContext?: unknown
}

type Job = {
  jobId?: number
  title?: string
  description?: string
  jobStatus?: number
}

export function buildModal(
  kind: ContextKind,
  nodeId: number,
  title: string,
  active: Active,
  jobs: Job[] = [],
): ModalPayload {
  if (kind === "jobs") {
    return { contextKind: kind, nodeId, nodeTitle: title, updatedAt: active.updatedAt, payload: jobs }
  }
  if (kind === "prompt") {
    return {
      contextKind: kind,
      nodeId,
      nodeTitle: title,
      updatedAt: active.updatedAt,
      payload: { aiPrompt: active.aiPrompt || "", eadScript: active.eadScript || "" },
    }
  }
  if (kind === "skills") {
    return {
      contextKind: kind,
      nodeId,
      nodeTitle: title,
      updatedAt: active.updatedAt,
      payload: Array.isArray(active.linkedSkills) ? active.linkedSkills : [],
    }
  }
  if (kind === "api") {
    return {
      contextKind: kind,
      nodeId,
      nodeTitle: title,
      updatedAt: active.updatedAt,
      payload: active.aiApi || "",
    }
  }
  return {
    contextKind: "source",
    nodeId,
    nodeTitle: title,
    updatedAt: active.updatedAt,
    payload: active.sourceContext || {},
  }
}

export function formatModal(injection: ModalPayload) {
  const lines = [
    "# EAD PFM Manual Injection",
    "",
    `- Context Kind: ${kindLabel(injection.contextKind)}`,
    `- Node: ${injection.nodeTitle} (${injection.nodeId})`,
    injection.updatedAt ? `- Updated At: ${injection.updatedAt}` : "",
    "",
  ].filter((line) => line !== "")

  if (injection.contextKind === "jobs") {
    const jobs = Array.isArray(injection.payload) ? (injection.payload as Job[]) : []
    lines.push("## AI Jobs")
    if (!jobs.length) lines.push("_No AI jobs found for this node._")
    else {
      for (const job of jobs) {
        lines.push(`- ${(job.title || `Job ${job.jobId || ""}`).trim()}${job.jobId ? ` (#${job.jobId})` : ""}`)
        if (job.description) lines.push(`  - ${job.description}`)
      }
    }
    return lines.join("\n")
  }

  if (injection.contextKind === "prompt") {
    const payload =
      injection.payload && typeof injection.payload === "object"
        ? (injection.payload as { aiPrompt?: string; eadScript?: string })
        : {}
    lines.push("## AI Prompt")
    lines.push(payload.aiPrompt?.trim() || "_No AI Prompt._")
    lines.push("", "## EAD Script")
    lines.push(
      payload.eadScript?.trim()
        ? ["```text", payload.eadScript.trim(), "```"].join("\n")
        : "_No EAD Script._",
    )
    return lines.join("\n")
  }

  if (injection.contextKind === "skills") {
    const skills = Array.isArray(injection.payload) ? injection.payload : []
    lines.push("## Linked EAD Skills")
    if (!skills.length) lines.push("_No linked EAD Skills._")
    else {
      for (const row of skills) {
        if (!row || typeof row !== "object") continue
        const skill = row as Record<string, unknown>
        lines.push(`### ${String(skill.title || skill.name || "Skill")}`)
        if (skill.description) lines.push(String(skill.description))
      }
    }
    return lines.join("\n")
  }

  if (injection.contextKind === "api") {
    lines.push("## AI API Context")
    lines.push(String(injection.payload || "").trim() || "_No AI API context._")
    return lines.join("\n")
  }

  lines.push("## Linked Source Code")
  lines.push("```json")
  lines.push(JSON.stringify(injection.payload ?? {}, null, 2))
  lines.push("```")
  return lines.join("\n")
}
