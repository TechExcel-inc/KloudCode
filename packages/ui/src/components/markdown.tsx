import { useMarked } from "../context/marked"
import { useI18n } from "../context/i18n"
import { useData, type ReadProjectFileFn } from "../context/data"
import { useDialog } from "../context/dialog"
import { ImagePreview } from "./image-preview"
import { classifyImageSource, projectFileToDataUrl, svgCodeToDataUrl } from "./markdown-image"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { checksum } from "@opencode-ai/util/encode"
import { ComponentProps, createEffect, createResource, createSignal, onCleanup, splitProps } from "solid-js"
import { isServer } from "solid-js/web"
import { stream } from "./markdown-stream"

type Entry = {
  hash: string
  html: string
}

const max = 200
const cache = new Map<string, Entry>()

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return

    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
  // DOMPurify drops file:// URLs; keep the path so the project file reader decides whether it may load.
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName !== "IMG" || data.attrName !== "src") return
    if (!/^file:\/\//i.test(data.attrValue)) return
    const path = data.attrValue.replace(/^file:\/\/(localhost)?/i, "")
    try {
      data.attrValue = decodeURI(path)
    } catch {
      data.attrValue = path
    }
  })
}

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>',
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fallback(markdown: string) {
  return escape(markdown).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")
}

type CopyLabels = {
  copy: string
  copied: string
}

const urlPattern = /^https?:\/\/[^\s<>()`"']+$/

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/, "")
  if (!urlPattern.test(href)) return
  try {
    const url = new URL(href)
    return url.toString()
  } catch {
    return
  }
}

function createIcon(path: string, slot: string) {
  const icon = document.createElement("div")
  icon.setAttribute("data-component", "icon")
  icon.setAttribute("data-size", "small")
  icon.setAttribute("data-slot", slot)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("data-slot", "icon-svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"))
  button.appendChild(createIcon(iconPaths.check, "check-icon"))
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("data-tooltip", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

  const buttons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  )

  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels))
    return
  }

  for (const button of buttons.slice(1)) {
    button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

// Resolved project images, keyed by directory and path, so re-renders reuse them.
const images = new Map<string, string | null>()
const pendingImages = new Map<string, Promise<string | null>>()

function imageKey(directory: string, path: string) {
  return `${directory}\0${path}`
}

function loadProjectImage(directory: string, path: string, read: ReadProjectFileFn) {
  const key = imageKey(directory, path)
  const existing = pendingImages.get(key)
  if (existing) return existing
  const task = read(path)
    .then((file) => projectFileToDataUrl(path, file) ?? null)
    .catch(() => null)
    .then((url) => {
      images.set(key, url)
      if (images.size > max) images.delete(images.keys().next().value!)
      return url
    })
    .finally(() => pendingImages.delete(key))
  pendingImages.set(key, task)
  return task
}

function markImage(img: HTMLImageElement) {
  img.setAttribute("data-slot", "markdown-image")
  img.setAttribute("loading", "lazy")
  img.setAttribute("draggable", "false")
}

function missingImage(img: HTMLImageElement, src: string) {
  const span = document.createElement("span")
  span.setAttribute("data-slot", "markdown-image-missing")
  span.textContent = img.getAttribute("alt") || src
  span.title = src
  img.replaceWith(span)
}

function decorateSvgBlock(block: HTMLPreElement, svgLabel: string) {
  const url = svgCodeToDataUrl(block.querySelector("code")?.textContent ?? block.textContent ?? "")
  if (!url) return
  const figure = document.createElement("div")
  figure.setAttribute("data-component", "markdown-svg")
  const img = document.createElement("img")
  img.src = url
  img.alt = "SVG"
  markImage(img)
  const details = document.createElement("details")
  details.setAttribute("data-slot", "markdown-svg-code")
  const summary = document.createElement("summary")
  summary.textContent = svgLabel
  details.appendChild(summary)
  block.replaceWith(figure)
  figure.appendChild(img)
  figure.appendChild(details)
  details.appendChild(block)
}

function decorateImages(root: HTMLDivElement, directory: string | undefined, read: ReadProjectFileFn | undefined) {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    if (img.getAttribute("data-slot") === "markdown-image") continue
    const src = img.getAttribute("src") ?? ""
    const source = classifyImageSource(src, directory)
    if (source.kind === "url") {
      markImage(img)
      continue
    }
    if (source.kind === "blocked" || !read || !directory) {
      missingImage(img, src)
      continue
    }
    const cached = images.get(imageKey(directory, source.path))
    if (cached === null) {
      missingImage(img, src)
      continue
    }
    markImage(img)
    img.setAttribute("data-project-path", source.path)
    if (cached) img.src = cached
    else img.removeAttribute("src")
  }
}

function decorate(
  root: HTMLDivElement,
  labels: CopyLabels & { svg: string },
  directory?: string,
  read?: ReadProjectFileFn,
) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    decorateSvgBlock(block, labels.svg)
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
  decorateImages(root, directory, read)
}

// Fills in project images that were not resolved yet, after the DOM is in place.
function resolveProjectImages(root: HTMLDivElement, directory: string | undefined, read: ReadProjectFileFn | undefined) {
  if (!directory || !read) return
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img[data-project-path]:not([src])"))) {
    const path = img.getAttribute("data-project-path")!
    void loadProjectImage(directory, path, read).then((url) => {
      if (!img.isConnected || img.getAttribute("data-project-path") !== path) return
      if (url) img.src = url
      else missingImage(img, path)
    })
  }
}

function setupImagePreview(root: HTMLDivElement, open: ((src: string, alt?: string) => void) | undefined) {
  if (!open) return () => {}
  const handleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLImageElement)) return
    if (target.getAttribute("data-slot") !== "markdown-image") return
    const src = target.getAttribute("src")
    if (!src) return
    event.preventDefault()
    event.stopPropagation()
    open(src, target.getAttribute("alt") ?? undefined)
  }
  root.addEventListener("click", handleClick)
  return () => root.removeEventListener("click", handleClick)
}

function setupCodeCopy(root: HTMLDivElement, getLabels: () => CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const updateLabel = (button: HTMLButtonElement) => {
    const labels = getLabels()
    const copied = button.getAttribute("data-copied") === "true"
    setCopyState(button, labels, copied)
  }

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    const labels = getLabels()
    setCopyState(button, labels, true)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
    timeouts.set(button, timeout)
  }

  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]'))
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) updateLabel(button)
  }

  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

// Markdown also renders outside a session (settings, stories); those places have no data or dialog.
function optional<T>(use: () => T) {
  try {
    return use()
  } catch {
    return undefined
  }
}

function touch(key: string, value: Entry) {
  cache.delete(key)
  cache.set(key, value)

  if (cache.size <= max) return

  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}

export function Markdown(
  props: ComponentProps<"div"> & {
    text: string
    cacheKey?: string
    streaming?: boolean
    class?: string
    classList?: Record<string, boolean>
  },
) {
  const [local, others] = splitProps(props, ["text", "cacheKey", "streaming", "class", "classList"])
  const marked = useMarked()
  const i18n = useI18n()
  const data = optional(useData)
  const dialog = optional(useDialog)
  const openImage = dialog
    ? (src: string, alt?: string) => dialog.show(() => <ImagePreview src={src} alt={alt} />)
    : undefined
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [html] = createResource(
    () => ({
      text: local.text,
      key: local.cacheKey,
      streaming: local.streaming ?? false,
    }),
    async (src) => {
      if (isServer) return fallback(src.text)
      if (!src.text) return ""

      const base = src.key ?? checksum(src.text)
      return Promise.all(
        stream(src.text, src.streaming).map(async (block, index) => {
          const hash = checksum(block.raw)
          const key = base ? `${base}:${index}:${block.mode}` : hash

          if (key && hash) {
            const cached = cache.get(key)
            if (cached && cached.hash === hash) {
              touch(key, cached)
              return cached.html
            }
          }

          const next = await Promise.resolve(marked.parse(block.src))
          const safe = sanitize(next)
          if (key && hash) touch(key, { hash, html: safe })
          return safe
        }),
      )
        .then((list) => list.join(""))
        .catch(() => fallback(src.text))
    },
    { initialValue: fallback(local.text) },
  )

  let copyCleanup: (() => void) | undefined
  let imageCleanup: (() => void) | undefined

  createEffect(() => {
    const container = root()
    const content = local.text ? (html.latest ?? html() ?? "") : ""
    if (!container) return
    if (isServer) return

    if (!content) {
      container.innerHTML = ""
      return
    }

    const labels = {
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied"),
      svg: i18n.t("ui.markdown.svgCode"),
    }
    const directory = data?.directory
    const read = data?.readFile
    const temp = document.createElement("div")
    temp.innerHTML = content
    decorate(temp, labels, directory, read)

    morphdom(container, temp, {
      childrenOnly: true,
      onBeforeElUpdated: (fromEl, toEl) => {
        if (
          fromEl instanceof HTMLButtonElement &&
          toEl instanceof HTMLButtonElement &&
          fromEl.getAttribute("data-slot") === "markdown-copy-button" &&
          toEl.getAttribute("data-slot") === "markdown-copy-button" &&
          fromEl.getAttribute("data-copied") === "true"
        ) {
          setCopyState(toEl, labels, true)
        }
        // Keep a resolved project image and an opened SVG code toggle across streaming re-renders.
        if (
          fromEl instanceof HTMLImageElement &&
          toEl instanceof HTMLImageElement &&
          fromEl.hasAttribute("src") &&
          !toEl.hasAttribute("src") &&
          fromEl.getAttribute("data-project-path") === toEl.getAttribute("data-project-path")
        ) {
          toEl.setAttribute("src", fromEl.getAttribute("src")!)
        }
        if (fromEl instanceof HTMLDetailsElement && toEl instanceof HTMLDetailsElement && fromEl.open) {
          toEl.open = true
        }
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    resolveProjectImages(container, directory, read)
    if (!imageCleanup) imageCleanup = setupImagePreview(container, openImage)

    if (!copyCleanup)
      copyCleanup = setupCodeCopy(container, () => ({
        copy: i18n.t("ui.message.copy"),
        copied: i18n.t("ui.message.copied"),
      }))
  })

  onCleanup(() => {
    if (copyCleanup) copyCleanup()
    if (imageCleanup) imageCleanup()
  })

  return (
    <div
      data-component="markdown"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      ref={setRoot}
      {...others}
    />
  )
}
