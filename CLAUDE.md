# CLAUDE.md

## Working language

Source files are English throughout: comments, docstrings, log/error text, template strings, and identifiers in `.lua`, `.sh`, `.py` stay English. External artifacts of THIS repo (docs, issues, PRs, comments, change notes) are **English-primary**; Chinese is welcome as a secondary bilingual layer where it adds value, but the canonical text is English. Site content is English-first with a Chinese version (zh-en bilingual). Do not mix languages mid-sentence; code identifiers, paths, command/protocol names, and quoted originals stay English.

（中文摘要：本仓语言英文为主、中英双语；源文件全英文；对外产物以英文为准，中文为辅；站点英文优先、提供中文版。）

## 这个仓库是什么

fkst-website 是 fkst 的第三个仓（库 C）：**网站本体是 `site/` 下的常规 Astro 静态网站项目，不通过 fkst engine 生成页面源码**。本仓仍保留 website 域 Lua package，用于 `site-board` 这类数据 artifact；这些 package 跑在 **fkst-substrate** 引擎上，并以 fkst-packages（库 B）的包为组合基础。引擎在 `fkst-substrate` 仓，包约定的母版在 `fkst-packages` 仓；**本仓不碰引擎 Rust，不复制库 B 包的内部逻辑**。

engine↔package 契约的权威是 fkst-substrate 的 `docs/package-repo-contract.md`；包结构约定（flat vs composed、core.lua 包内共享、composed.deps、schema/dedup_key、出站 dry-run 姿态开关）与 fkst-packages 的 `CLAUDE.md` 一致，此处不复述。

## 本仓特有约定

- **三档扩展模型**（见 README）：Tap 旁路 → Adapter 接线 → 静态 rebind（不存在，逢真需求向 fkst-substrate 提案）。**不做运行时拦截**；插入环节必须是一等显式 department。
- **跨仓组合**：引用库 B 的包 = pin git ref + 额外 `--package-root`；包间不跨 require，只经 `pkg.queue` 限定名集成。
- **站点构建边界**：页面源码、layout、assets 和 Markdown 内容属于 `site/` Astro 项目；build 输出到 `site/_site/`，由 GitHub Pages 上传。不要新增 FKST engine department 来生成页面源码。
- **站点数据输出**：`site-board` 只写 `FKST_SITE_OUT`（默认 `build/fkst/data`）下的 FKST data-layer artifacts，不写 hand-authored `site/`。Astro 以后可把这些 artifact 当普通 build-time data input 读取。
- **payload 宪法**：大体量内容绝不整体序列化进可靠投递 payload；payload 只承载 `source_ref` 指针 + 小控制字段，consumer 回源 fetch。

## 目录结构：网站源码主仓（与 Lua 主仓 fkst-packages 有意不同）

本仓是**网站源码主仓**，fkst-packages（库 B）是 **Lua 主仓**——两者目录结构按**语言主属性**有意分开，不是不一致：

- **库 B（Lua 主）**：整个仓就是 Lua，committed Lua 源码放根 `packages/<pkg>/`；`scripts/run.sh` 生成 `.fkst/local-packages -> ../packages` 作为引擎加载的运行时视图（gitignore）。Lua 放根天经地义。
- **本仓（网站源码主）**：仓库根是**网站源码**（`site/` 等），`site/` 是 Astro 项目；**Lua 包不放根**——本仓自有 Lua 包 committed 在 **`.fkst/local-packages/<pkg>/`**，让根保持纯网站源码、Lua 收进引擎运行时命名空间。引擎直接从 `.fkst/local-packages` 加载（committed home，无需生成步骤）。
- **`.fkst/` 是运行时接口目录，本就 tracked + ignored 混合，不是「全 runtime-generated」**：每个 fkst 仓的 `.fkst/` 都**已 tracked** `.fkst/env.example` 与 substrate source-pin，只 **ignore** `.fkst/run/`、`.fkst/env`、外部引用包落点 `.fkst/packages/`。本仓（host）在这个既有事实上**additionally track** `.fkst/local-packages/`（本仓自有 Lua 包）+ `.fkst/local-libraries/`（本仓自定义 libraries，见下）。因为 `.fkst/` 从来就不是纯运行时，把 committed Lua 源码放进 `.fkst/` 与既有的 tracked 配置**完全一致、无任何代价**——只是语言主属性不同导致 tracked 集合不同。
  - 本仓 `.gitignore`：**track** `.fkst/local-packages/`、`.fkst/local-libraries/`、substrate source-pin、`.fkst/env.example`；**ignore** `.fkst/packages/`、`.fkst/run/`、`.fkst/env`。
  - 对比库 B（Lua 主）：`.fkst/local-packages` 在库 B 是 **ignore**（`-> ../packages` 的生成视图）；在本仓是 **track**（committed Lua 的家）。同一路径、相反 git 状态，皆因语言主属性——这是设计，明确写在此以免误删。
- **跨仓组合（已有规则，重申）**：引用库 B 的包 = pin git ref + 额外 `--package-root`，只经 `pkg.queue` 限定名集成，**不跨 require**。
- **当前状态**：`site-board` 已在 `.fkst/local-packages/site-board/`；`scripts/run.sh` 和 `.gitignore` 按本仓网站源码主布局处理。

## Host Libraries: capability names, not catch-all std

- **fkst-packages (库 B) has no `std` library today**: its shared code is the responsibility-named set `contract` / `workflow` / `testkit` / `forge` / `devloop`. New shared capability belongs in a minimal, intent-named library, never in a revived catch-all `std`.
- **fkst-website (库 C) also has no per-repo `std` convention**: ADR-0002 fixes where host-owned libraries live (`.fkst/local-libraries/`), not what they are named. Host libraries are named by content/capability; the current text helper library is `text`, consumed with `lib_deps = ["text"]` and `require("text.trim")`.
- **The 库 B ↔ 库 C package boundary stays queue-only**: 库 C packages do not `require` 库 B packages or in-repo private source. A cross-repo library exists only when it is a named, versioned, `[library] publishable` unit exposed through `[[external_sources]]` (for example, `contract`). There is no `platform_std`.

## 构建 / 测试

- `cp env.example .env` 填 `BIN=<fkst-substrate>/target/debug/fkst-framework`。
- website build: `cd site && npm ci && npm run build`，产物是 `site/_site/`；`scripts/probe_built_site.sh site/_site` 是部署前 URL gate。
- `scripts/run.sh test [pkg]` 单一入口（self-test + flat conformance + test + 组合 conformance）；`scripts/run.sh check` 调用 pinned fkst-packages shared source ratchets + `fkst-framework conformance`，本仓只提供 package roots 与 allowlists。
- cross-repo version coordinates are single-source: `.fkst-substrate-ref` pins the engine source; `fkst.lock` `external_source(id=fkst-packages-platform).resolved.rev` pins fkst-packages for both shared ratchets and platform libraries. Do not reintroduce `.fkst-packages-ref` or any second fkst-packages top-level `*-ref` pin.
- shared source ratchet source hydrates to ignored `.fkst/run/fkst-packages-platform/` from the `fkst.lock` fkst-packages platform rev. To bump it, update `fkst.workspace.toml`, regenerate `fkst.lock` with `fkst-framework deps lock`, delete the hydrated checkout if needed, then run `scripts/run.sh check` and `scripts/run.sh test`.
- CI 从 `.fkst-substrate-ref` source-pin checkout 引擎并构建，同时从 `fkst.lock` hydrate shared ratchet source。

## Git 提交/分支规范

与 fkst-packages 一致：集成/默认分支 `dev`，不直接向 `dev` 提交；分支名 `<type>/<kebab-topic>`（`feat|fix|docs|chore|refactor|test`）；提交 subject 一行中文祈使句；PR 标题中文、正文含动机/改动/测试证据，CI 绿才合，squash 保持线性；AI 生成的对外文本末尾保留 `⟦AI:FKST⟧`。

## 纪律

- 单个源代码文件 ≤1000 行，硬上限。
- 不留 deprecated shim / compat layer / `.old` / `_legacy`；改契约就改完整。
- 不要历史兼容：系统只有当前态一种形态；可关的运行姿态用 host 环境事实表达，不在代码里留双模式分叉。
- 错误分类要窄；日志/commit/event payload 可 grep。
- 引擎 Rust 改动属 fkst-substrate 仓；库 B 包改动属 fkst-packages 仓。

⟦AI:FKST⟧
