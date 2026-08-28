import { Show, createSignal, type JSX } from "solid-js"
import { useParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { decode64 } from "@/utils/base64"
import { SettingsList } from "./settings-list"
import { useEad } from "@/ead/settings"
import { eadApi, eadServer } from "@/ead/urls"
import { mcpSnippet } from "@/ead/mcp"
import { ensureEadMcp } from "@/ead/ensure-mcp"

function Row(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <div class="flex items-start justify-between gap-4 py-3 border-b border-border-weaker-base last:border-b-0">
      <div class="flex flex-col gap-0.5 min-w-0">
        <span class="text-14-medium text-text-strong">{props.title}</span>
        <span class="text-12-regular text-text-weak">{props.description}</span>
      </div>
      <div class="shrink-0 flex items-center justify-end">{props.children}</div>
    </div>
  )
}

export function SettingsEad() {
  const language = useLanguage()
  const ead = useEad()
  const globalSDK = useGlobalSDK()
  const layout = useLayout()
  const server = useServer()
  const params = useParams()
  const [token, setToken] = createSignal(ead.token())
  const [entry, setEntry] = createSignal(ead.mcpEntry())
  const [copied, setCopied] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const worktree = () => {
    const fromUrl = params.dir ? decode64(params.dir) : ""
    if (fromUrl) return fromUrl
    const last = server.projects.last()
    if (last) return last
    return layout.projects.list()[0]?.worktree || "/"
  }

  const client = () =>
    globalSDK.createClient({
      directory: worktree(),
      throwOnError: true,
    })

  return (
    <div class="flex flex-col gap-6 p-4">
      <div>
        <h2 class="text-16-medium text-text-strong">{language.t("settings.ead.title")}</h2>
        <p class="text-12-regular text-text-weak mt-1">{language.t("settings.ead.description")}</p>
      </div>

      <SettingsList>
        <Row title={language.t("settings.ead.serverUrl.title")} description={language.t("settings.ead.serverUrl.description")}>
          <span class="text-12-regular text-text-base truncate max-w-[280px]">{eadServer()}</span>
        </Row>
        <Row title={language.t("settings.ead.apiUrl.title")} description={language.t("settings.ead.apiUrl.description")}>
          <span class="text-12-regular text-text-base truncate max-w-[280px]">{eadApi()}</span>
        </Row>
        <Row title={language.t("settings.ead.env.title")} description={language.t("settings.ead.env.description")}>
          <select
            class="h-8 text-12-regular rounded-md border border-border-weak-base bg-background-base px-2"
            value={ead.env()}
            onChange={(e) => {
              ead.setEnv(e.currentTarget.value === "localhost" ? "localhost" : "production")
            }}
          >
            <option value="production">eadfm.com</option>
            <option value="localhost">localhost</option>
          </select>
        </Row>
        <Row title={language.t("settings.ead.token.title")} description={language.t("settings.ead.token.description")}>
          <div class="flex flex-col gap-2 w-full max-w-[320px]">
            <input
              class="w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"
              type="password"
              value={token()}
              onInput={(e) => setToken(e.currentTarget.value)}
              placeholder="Bearer token"
            />
            <div class="flex gap-2 justify-end">
              <Button size="small" variant="primary" onClick={() => ead.setToken(token())}>
                {language.t("common.save")}
              </Button>
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  ead.signOut()
                  setToken("")
                }}
              >
                {language.t("settings.ead.token.clear")}
              </Button>
            </div>
          </div>
        </Row>
        <Row title={language.t("settings.ead.product.title")} description={language.t("settings.ead.product.description")}>
          <span class="text-12-regular text-text-base">
            <Show when={ead.productId() > 0} fallback="—">
              {ead.productName() || ead.productId()} ({ead.productId()})
            </Show>
          </span>
        </Row>
        <Row title="Pilot mode" description="cursor (default, Cursor extension parity) or opencode">
          <select
            class="h-8 text-12-regular rounded-md border border-border-weak-base bg-background-base px-2"
            value={ead.pilotMode()}
            onChange={(e) => {
              ead.setPilotMode(e.currentTarget.value === "cursor" ? "cursor" : "opencode")
              ead.bumpPilot()
            }}
          >
            <option value="opencode">opencode</option>
            <option value="cursor">cursor</option>
          </select>
        </Row>
        <Row title={language.t("settings.ead.mcpEntry.title")} description={language.t("settings.ead.mcpEntry.description")}>
          <div class="flex flex-col gap-2 w-full max-w-[360px]">
            <input
              class="w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"
              value={entry()}
              onInput={(e) => setEntry(e.currentTarget.value)}
            />
            <Button size="small" variant="secondary" onClick={() => ead.setMcpEntry(entry())}>
              {language.t("common.save")}
            </Button>
          </div>
        </Row>
        <Row title={language.t("settings.ead.mcp.title")} description={language.t("settings.ead.mcp.description")}>
          <div class="flex flex-col gap-2 items-end">
            <span class="text-11-regular text-text-weak truncate max-w-[360px]" title={worktree()}>
              Worktree: {worktree()}
            </span>
            <div class="flex gap-2">
              <Button
                size="small"
                variant="primary"
                disabled={busy()}
                onClick={async () => {
                  setBusy(true)
                  try {
                    ead.setMcpEntry(entry())
                    ead.setToken(token())
                    await ensureEadMcp({
                      client: client(),
                      token: token() || ead.token(),
                      entry: entry() || ead.mcpEntry(),
                      worktree: worktree(),
                    }).then((path) => {
                      if (path) {
                        ead.setMcpEntry(path)
                        setEntry(path)
                      }
                    })
                    showToast({
                      title: language.t("settings.ead.mcp.ok.title"),
                      description: language.t("settings.ead.mcp.ok.description"),
                      variant: "success",
                    })
                  } catch (e) {
                    showToast({
                      title: language.t("settings.ead.mcp.fail.title"),
                      description: e instanceof Error ? e.message : String(e),
                      variant: "error",
                    })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {language.t("settings.ead.mcp.apply")}
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={async () => {
                  const text = JSON.stringify(mcpSnippet(ead.token(), ead.mcpEntry()), null, 2)
                  await navigator.clipboard.writeText(text)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied() ? language.t("settings.ead.mcp.copied") : language.t("settings.ead.mcp.copy")}
              </Button>
            </div>
          </div>
        </Row>
      </SettingsList>
    </div>
  )
}
