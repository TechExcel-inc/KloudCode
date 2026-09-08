/** Map chrome help tips — keep in sync with Cursor extension v1.0.211 navigator-help-tips.js */

export type TipId =
  | "pfm-schema-filter"
  | "ead-map-search-setup"
  | "pfm-tree-filter"
  | "job-owner-filter"
  | "navigator-view-mode"

type Pack = { en: string; zh: string; ja: string; ko: string }

const titles: Record<TipId, Pack> = {
  "pfm-schema-filter": {
    en: "PFM schema type",
    zh: "PFM Schema 类型",
    ja: "PFM スキーマタイプ",
    ko: "PFM 스키마 유형",
  },
  "ead-map-search-setup": {
    en: "EAD Map setup",
    zh: "EAD Map 设置",
    ja: "EAD Map セットアップ",
    ko: "EAD Map 설정",
  },
  "pfm-tree-filter": {
    en: "PFM Tree View",
    zh: "PFM Tree View",
    ja: "PFM Tree View",
    ko: "PFM Tree View",
  },
  "job-owner-filter": {
    en: "AI Job Owner",
    zh: "AI Job Owner",
    ja: "AI Job Owner",
    ko: "AI Job Owner",
  },
  "navigator-view-mode": {
    en: "PFM / AI Code view",
    zh: "PFM / AI Code 视图",
    ja: "PFM / AI Code ビュー",
    ko: "PFM / AI Code 보기",
  },
}

const bodies: Record<TipId, Pack> = {
  "pfm-schema-filter": {
    en: "## PFM schema type (navigator)\n\nThe **PFM:** control selects which **Dynamic Schema Type** (sub-schema) is active for the current product map — e.g. Project Base, Requirement, Development, Test Case, Test Run.\n\n---\n\n### What changes when you switch\n\n- The navigator **PFM tree** shows nodes for the selected type.\n- Studio / Pilot / AI jobs use that type’s scope for the active product.\n- The label shows **Map name – Type name**; the type name stays fully visible when the row is long.\n\n---\n\n### Tips\n\n- Types are defined under the product’s **PFM Schema** (Schema Setup / PFM editor → support sub-schemas).\n- Pick the type that matches the work you are doing (e.g. Test Case when writing AI tests).",
    zh: "## PFM Schema 类型（导航器）\n\n**PFM:** 控件用于选择当前产品图的 **Dynamic Schema Type**（子 Schema），例如 Project Base、Requirement、Development、Test Case、Test Run。\n\n---\n\n### 切换后会变化\n\n- 导航器 **PFM 树** 显示所选类型的节点。\n- Studio / Pilot / AI 任务按该类型范围工作。\n- 标签为 **地图名 – 类型名**；过长时类型名保持完整可见。\n\n---\n\n### 提示\n\n- 类型在产品的 **PFM Schema** 中定义（Schema Setup / PFM 编辑 → 启用子 Schema）。\n- 按当前工作选择类型（例如写 AI 测试时选 Test Case）。",
    ja: "## PFM スキーマタイプ（ナビゲーター）\n\n**PFM:** で現在の製品マップの Dynamic Schema Type（サブスキーマ）を選びます。\n\n---\n\n### Tips\n\n- 切替で PFM ツリーの範囲が変わります。\n- タイプは PFM Schema のサブスキーマ設定で定義します。",
    ko: "## PFM 스키마 유형(내비게이터)\n\n**PFM:** 으로 현재 제품 맵의 Dynamic Schema Type(서브 스키마)을 선택합니다.\n\n---\n\n### Tips\n\n- 전환 시 PFM 트리 범위가 바뀝니다.\n- 유형은 PFM Schema의 서브 스키마 설정에서 정의합니다.",
  },
  "ead-map-search-setup": {
    en: "## EAD Map setup menu (⋯)\n\nActions next to the navigator search box for map setup and filters.\n\n---\n\n### Menu items\n\n- **View and Setup EAD Map** — Open the interactive map setup mindmap to review and configure the EAD Map.\n- **Setup EAD Map Filter** — Choose which PFM nodes are included when the node filter is on.\n- **Enable Job Owner Filter** — Show the **AI Job Owner** control so you can limit AI jobs to All / Me / selected members.\n\n---\n\n### Tips\n\n- Turn Job Owner Filter off from this menu when you want the full job list again.\n- Node filter On/Off appears under search after you have selected nodes.",
    zh: "## EAD Map 设置菜单（⋯）\n\n导航器搜索框旁的地图设置与筛选操作。\n\n---\n\n### 菜单项\n\n- **查看并设置 EAD Map** — 打开交互式地图设置 mindmap。\n- **设置 EAD Map 筛选** — 选择节点筛选开启时包含的 PFM 节点。\n- **启用 Job Owner 筛选** — 显示 **AI Job Owner** 控件，按 All / 我 / 指定成员过滤 AI 任务。\n\n---\n\n### 提示\n\n- 需要完整任务列表时，可在此关闭 Job Owner 筛选。\n- 选择节点后，搜索下方会出现节点筛选 On/Off。",
    ja: "## EAD Map セットアップメニュー（⋯）\n\n検索横のマップ設定とフィルタ操作です。\n\n---\n\n### Tips\n\n- View and Setup / Filter / Job Owner Filter を切り替えます。",
    ko: "## EAD Map 설정 메뉴(⋯)\n\n검색창 옆의 맵 설정 및 필터 작업입니다.\n\n---\n\n### Tips\n\n- View and Setup / Filter / Job Owner Filter를 전환합니다.",
  },
  "pfm-tree-filter": {
    en: "## PFM Tree View options\n\nControls what badges appear on PFM nodes and which nodes are listed in the navigator tree.\n\n---\n\n### Show EAD and AI jobs\n\n- **Show Number of EADs** — Badge counts EAD content on each node.\n- **Show Open AI Jobs** — Badge counts open AI coding jobs.\n- **Show Open Test Cases** — Badge counts open AI test cases.\n- Click the selected option again to clear badges.\n\n---\n\n### Tree view\n\n- **Show All PFM Nodes** — Full map tree.\n- **Show Filtered PFM Nodes Only** — Only nodes that match the active badge filter (e.g. nodes with open jobs).\n\n---\n\n### Tips\n\n- Combine with **Setup EAD Map Filter** (⋯ menu) when you need a saved node subset.\n- **Show Debug Message** (when available) is for diagnostics only.",
    zh: "## PFM Tree View 选项\n\n控制导航器树节点上的徽章，以及显示哪些节点。\n\n---\n\n### 显示 EAD 与 AI 任务\n\n- **显示 EAD 数量** — 节点上的 EAD 徽章。\n- **显示未完成 AI Jobs** — 打开的 AI 编码任务数量。\n- **显示未完成 Test Cases** — 打开的 AI 测试用例数量。\n- 再次点击已选项可清除徽章。\n\n---\n\n### 树视图\n\n- **显示全部 PFM 节点** — 完整地图树。\n- **仅显示筛选后的节点** — 只显示匹配当前徽章筛选的节点。\n\n---\n\n### 提示\n\n- 需要固定节点子集时，配合 ⋯ 菜单中的 **设置 EAD Map 筛选**。\n- **Show Debug Message**（若有）仅用于诊断。",
    ja: "## PFM Tree View オプション\n\nノードのバッジと表示範囲を切り替えます。\n\n---\n\n### Tips\n\n- EAD / Open Jobs / Open Tests のバッジ。\n- All Nodes と Filtered Only を切替。",
    ko: "## PFM Tree View 옵션\n\n노드 배지와 표시 범위를 전환합니다.\n\n---\n\n### Tips\n\n- EAD / Open Jobs / Open Tests 배지.\n- All Nodes와 Filtered Only 전환.",
  },
  "job-owner-filter": {
    en: "## AI Job Owner filter\n\nLimits which **AI coding jobs** appear in the navigator and related job views, based on who owns the job.\n\n---\n\n### Choices\n\n- **All** — Show jobs for every owner (no owner filter).\n- **Me** — Only jobs you own.\n- **Team member** — Only jobs owned by the selected person (search the list).\n\n---\n\n### Multi-select\n\nUse the person/people toggle in the menu to select **multiple owners** (and optionally Me), then apply. Useful when reviewing work across a few teammates.\n\n---\n\n### Tips\n\n- Enable this filter from the **⋯** menu next to search (**Enable Job Owner Filter**).\n- Turning the filter off restores the full job list without clearing your last selection preferences.",
    zh: "## AI Job Owner 筛选\n\n按任务负责人限制导航器及相关视图中显示的 **AI 编码任务**。\n\n---\n\n### 选项\n\n- **全部** — 显示所有负责人的任务。\n- **我** — 仅显示你负责的任务。\n- **团队成员** — 仅显示所选成员负责的任务（可搜索列表）。\n\n---\n\n### 多选\n\n用菜单中的单人/多人切换可选择**多名负责人**（可含“我”），然后应用。适合同时查看几位同事的工作。\n\n---\n\n### 提示\n\n- 在搜索旁的 **⋯** 菜单中开启（**启用 Job Owner 筛选**）。\n- 关闭筛选会恢复完整任务列表，并保留你上次的选择偏好。",
    ja: "## AI Job Owner フィルタ\n\nジョブ所有者で AI コーディングジョブの表示を絞り込みます。\n\n---\n\n### Tips\n\n- All / Me / メンバーを選択。\n- 複数選択モードで複数オーナーを適用できます。\n- 検索横の ⋯ から有効化します。",
    ko: "## AI Job Owner 필터\n\n작업 소유자로 AI 코딩 작업 표시를 제한합니다.\n\n---\n\n### Tips\n\n- All / Me / 멤버를 선택하세요.\n- 다중 선택 모드로 여러 소유자를 적용할 수 있습니다.\n- 검색 옆 ⋯ 메뉴에서 켭니다.",
  },
  "navigator-view-mode": {
    en: "## PFM Tree View / AI Code View\n\nSwitch how the EAD Map navigator lists content for the current product.\n\n---\n\n### PFM Tree View\n\nShows the **PFM map tree** (pages, folders, nodes). Use the folder filter button for EAD / AI job badges and filtered node lists.\n\n---\n\n### AI Code View\n\nShows the **source code tree** linked to this product (when a source schema is configured). Use this when working with AI Code / Pilot against repo files.\n\n---\n\n### Tips\n\n- AI Code View stays disabled until the product has an active **source code schema**.\n- Switching views does not change the selected product or Dynamic Schema type.",
    zh: "## PFM Tree View / AI Code View\n\n切换当前产品在 EAD Map 导航器中的列表方式。\n\n---\n\n### PFM Tree View\n\n显示 **PFM 地图树**（页面、文件夹、节点）。用旁边的文件夹筛选按钮控制 EAD / AI 任务徽章与筛选节点。\n\n---\n\n### AI Code View\n\n显示产品关联的 **源代码树**（需已配置 Source Schema）。适合在仓库文件上使用 AI Code / Pilot。\n\n---\n\n### 提示\n\n- 未配置 Source Schema 时，AI Code View 不可用。\n- 切换视图不会改变当前产品或 Dynamic Schema 类型。",
    ja: "## PFM Tree View / AI Code View\n\nナビゲーターの表示を PFM ツリーとソースコードツリーで切り替えます。\n\n---\n\n### Tips\n\n- Source Schema があるとき AI Code View が有効になります。",
    ko: "## PFM Tree View / AI Code View\n\n내비게이터를 PFM 트리와 소스 코드 트리로 전환합니다.\n\n---\n\n### Tips\n\n- Source Schema가 있을 때 AI Code View를 사용할 수 있습니다.",
  },
}

export function tipTitle(id: TipId, lang: keyof Pack) {
  const row = titles[id]
  return row[lang] || row.en
}

export function tipBody(id: TipId, lang: keyof Pack) {
  const row = bodies[id]
  return row[lang] || row.en
}

const prefix: Pack = {
  en: "Online help",
  zh: "在线帮助",
  ja: "オンラインヘルプ",
  ko: "온라인 도움말",
}

export function tipDialogTitle(id: TipId, lang: keyof Pack) {
  return `${prefix[lang] || prefix.en}: ${tipTitle(id, lang)}`
}

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inline(md: string) {
  return esc(md).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
}

export function markdownToHelpHtml(md: string) {
  const lines = md.split("\n")
  const out: string[] = []
  let list = false
  const close = () => {
    if (!list) return
    out.push("</ul>")
    list = false
  }
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      close()
      continue
    }
    if (trimmed === "---") {
      close()
      out.push('<hr class="help-tip-hr" />')
      continue
    }
    if (trimmed.startsWith("### ")) {
      close()
      out.push(`<h3 class="help-tip-h3">${inline(trimmed.slice(4))}</h3>`)
      continue
    }
    if (trimmed.startsWith("## ")) {
      close()
      out.push(`<h2 class="help-tip-h2">${inline(trimmed.slice(3))}</h2>`)
      continue
    }
    if (trimmed.startsWith("- ")) {
      if (!list) {
        out.push('<ul class="help-tip-ul">')
        list = true
      }
      out.push(`<li class="help-tip-li">${inline(trimmed.slice(2))}</li>`)
      continue
    }
    close()
    out.push(`<p class="help-tip-p">${inline(trimmed)}</p>`)
  }
  close()
  return out.join("")
}

export const TIP_IDS: TipId[] = [
  "pfm-schema-filter",
  "ead-map-search-setup",
  "pfm-tree-filter",
  "job-owner-filter",
  "navigator-view-mode",
]
