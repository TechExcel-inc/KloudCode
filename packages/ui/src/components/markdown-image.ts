// Decides which images in an assistant reply render and where their bytes come from.
// Remote (http/https) and inline data images load directly. Local paths only load
// through the project's file reader, so a reply can never pull in a file outside the project.

export type ImageSource =
  | { kind: "url"; url: string }
  | { kind: "project"; path: string }
  | { kind: "blocked"; reason: "outside-project" | "not-image" | "unsupported" }

const IMAGE_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
}

function extension(path: string) {
  const clean = path.split(/[?#]/)[0] ?? ""
  const dot = clean.lastIndexOf(".")
  if (dot < 0 || dot < clean.lastIndexOf("/")) return ""
  return clean.slice(dot + 1).toLowerCase()
}

export function imageMime(path: string) {
  return IMAGE_EXT[extension(path)]
}

export function isImagePath(path: string) {
  return !!imageMime(path)
}

function normalize(path: string) {
  const out: string[] = []
  for (const part of path.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (out.length === 0) return
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join("/")
}

function decode(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function classifyImageSource(src: string, directory?: string): ImageSource {
  const value = src.trim()
  if (!value) return { kind: "blocked", reason: "unsupported" }

  if (/^data:/i.test(value)) {
    if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(value)) return { kind: "url", url: value }
    return { kind: "blocked", reason: "not-image" }
  }
  if (/^https?:\/\//i.test(value)) return { kind: "url", url: value }
  if (/^blob:/i.test(value)) return { kind: "url", url: value }

  let path = value
  if (/^file:\/\//i.test(path)) path = decode(path.replace(/^file:\/\/(localhost)?/i, ""))
  else if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return { kind: "blocked", reason: "unsupported" }
  path = path.replace(/\\/g, "/")

  if (!isImagePath(path)) return { kind: "blocked", reason: "not-image" }
  if (!directory) return { kind: "blocked", reason: "outside-project" }

  const root = normalize(directory.replace(/\\/g, "/"))
  if (root === undefined) return { kind: "blocked", reason: "outside-project" }
  const absolute = path.startsWith("/") || /^[a-z]:\//i.test(path)
  const full = normalize(absolute ? path : `${root}/${path}`)
  if (full === undefined) return { kind: "blocked", reason: "outside-project" }
  if (full !== root && !full.startsWith(root ? `${root}/` : "")) return { kind: "blocked", reason: "outside-project" }
  const relative = root ? full.slice(root.length + 1) : full
  if (!relative) return { kind: "blocked", reason: "outside-project" }
  return { kind: "project", path: relative }
}

// A code block whose whole body is one complete <svg> element renders as a picture.
// The SVG is shown through <img>, where the browser runs no scripts and loads nothing external.
export function svgCodeToDataUrl(code: string) {
  const text = code.trim().replace(/^<\?xml[^>]*\?>\s*/i, "")
  if (!/^<svg[\s>]/i.test(text)) return
  if (!/<\/svg>$/i.test(text)) return
  const withNs = /xmlns\s*=/.test(text.slice(0, text.indexOf(">") + 1))
    ? text
    : text.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`
}

export type ProjectFile = { content?: string; mimeType?: string; encoding?: string }

// Turns the project file reader's answer into an image URL, or nothing when the file is empty or missing.
export function projectFileToDataUrl(path: string, file: ProjectFile | undefined) {
  if (!file?.content) return
  const mime = file.mimeType?.startsWith("image/") ? file.mimeType : imageMime(path)
  if (!mime) return
  if (file.encoding === "base64") return `data:${mime};base64,${file.content}`
  if (mime === "image/svg+xml") return svgCodeToDataUrl(file.content)
  return
}

// A Write tool call that created an SVG file can be previewed from its own content.
export function writtenImageUrl(path: string, content: string | undefined) {
  if (!content || imageMime(path) !== "image/svg+xml") return
  return svgCodeToDataUrl(content)
}

// A question option's picture: inline SVG markup, a project image path, or a URL.
export function optionImageSource(image: string, directory?: string): ImageSource {
  const svg = svgCodeToDataUrl(image)
  if (svg) return { kind: "url", url: svg }
  if (/^\s*</.test(image)) return { kind: "blocked", reason: "not-image" }
  return classifyImageSource(image, directory)
}

export async function loadImageSource(
  source: ImageSource,
  read: ((path: string) => Promise<ProjectFile | undefined>) | undefined,
) {
  if (source.kind === "url") return source.url
  if (source.kind !== "project" || !read) return
  const file = await read(source.path).catch(() => undefined)
  return projectFileToDataUrl(source.path, file)
}
