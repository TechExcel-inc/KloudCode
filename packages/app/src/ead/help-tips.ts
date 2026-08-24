/** Map chrome help tips — keep in sync with Cursor navigator-help-tips / public/help/navigator-tips.json. */

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
    en: "## PFM schema type\n\nThe **PFM:** control selects which Dynamic Schema Type is active for the current product map.\n\n### What changes\n- The PFM tree shows nodes for the selected type.\n- Pilot / AI jobs use that type’s scope.\n\n### Tips\n- Types are defined under the product’s PFM Schema.\n- Pick the type that matches your current work.",
    zh: "## PFM Schema 类型\n\n**PFM:** 控件用于选择当前产品图的 Dynamic Schema Type。\n\n### 切换后会变化\n- PFM 树显示所选类型的节点。\n- Pilot / AI 任务按该类型范围工作。\n\n### 提示\n- 类型在产品的 PFM Schema 中定义。\n- 按当前工作选择类型。",
    ja: "## PFM スキーマタイプ\n\n**PFM:** で Dynamic Schema Type を選びます。切替でツリー範囲が変わります。",
    ko: "## PFM 스키마 유형\n\n**PFM:** 으로 Dynamic Schema Type을 선택합니다. 전환 시 트리 범위가 바뀝니다.",
  },
  "ead-map-search-setup": {
    en: "## EAD Map setup menu\n\n- **View and Setup EAD Map** — interactive map setup.\n- **Setup EAD Map Filter** — choose which PFM nodes are included.\n- **Enable Job Owner Filter** — limit AI jobs by owner.\n- **Crawl and Vision** — generate Dynamic PFM tree for the selected type.",
    zh: "## EAD Map 设置菜单\n\n- **查看并设置 EAD Map** — 交互式地图设置。\n- **设置 EAD Map 筛选** — 选择包含的 PFM 节点。\n- **启用 Job Owner 筛选** — 按负责人过滤 AI 任务。\n- **爬取与视觉识别** — 为所选类型生成动态 PFM 树。",
    ja: "## EAD Map セットアップメニュー\n\nView and Setup / Filter / Job Owner / Crawl and Vision を切り替えます。",
    ko: "## EAD Map 설정 메뉴\n\nView and Setup / Filter / Job Owner / Crawl and Vision을 전환합니다.",
  },
  "pfm-tree-filter": {
    en: "## PFM Tree View options\n\n- Badge counts: EADs / Open AI Jobs / Open Test Cases.\n- **Show All** vs **Filtered Only** for the tree list.",
    zh: "## PFM Tree View 选项\n\n- 徽章：EAD / 未完成 AI Jobs / 未完成 Test Cases。\n- **显示全部** 与 **仅筛选节点**。",
    ja: "## PFM Tree View\n\nEAD / Jobs / Tests バッジと All / Filtered を切替。",
    ko: "## PFM Tree View\n\nEAD / Jobs / Tests 배지와 All / Filtered 전환.",
  },
  "job-owner-filter": {
    en: "## AI Job Owner filter\n\n- **All** / **Me** / team member(s).\n- Enable from the ⋯ menu next to search.",
    zh: "## AI Job Owner 筛选\n\n- **全部** / **我** / 团队成员。\n- 在搜索旁 ⋯ 菜单中开启。",
    ja: "## AI Job Owner\n\nAll / Me / メンバー。検索横の ⋯ から有効化。",
    ko: "## AI Job Owner\n\nAll / Me / 멤버. 검색 옆 ⋯에서 켭니다.",
  },
  "navigator-view-mode": {
    en: "## PFM Tree View / AI Code View\n\nSwitch between the PFM map tree and the linked source tree. AI Code View needs an active source schema.",
    zh: "## PFM Tree View / AI Code View\n\n在 PFM 地图树与关联源码树之间切换。AI Code View 需已配置 Source Schema。",
    ja: "## PFM / AI Code\n\nPFM ツリーとソースツリーを切替。Source Schema が必要です。",
    ko: "## PFM / AI Code\n\nPFM 트리와 소스 트리 전환. Source Schema가 필요합니다.",
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

export const TIP_IDS: TipId[] = [
  "pfm-schema-filter",
  "ead-map-search-setup",
  "pfm-tree-filter",
  "job-owner-filter",
  "navigator-view-mode",
]
