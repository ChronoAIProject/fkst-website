# CLAUDE.md

## Working language

Source files are English throughout: comments, docstrings, log/error text, template strings, and identifiers in `.lua`, `.sh`, `.py` stay English. External artifacts of THIS repo (docs, issues, PRs, comments, change notes) are **English-primary**; Chinese is welcome as a secondary bilingual layer where it adds value, but the canonical text is English. Site content is English-first with a Chinese version (zh-en bilingual). Do not mix languages mid-sentence; code identifiers, paths, command/protocol names, and quoted originals stay English.

（中文摘要：本仓语言英文为主、中英双语；源文件全英文；对外产物以英文为准，中文为辅；站点英文优先、提供中文版。）

## 这个仓库是什么

fkst-website 是 fkst 的第三个仓（库 C）：跑在 **fkst-substrate** 引擎上的 website 域 Lua package 库，以 fkst-packages（库 B）的包为组合基础。引擎在 `fkst-substrate` 仓，包约定的母版在 `fkst-packages` 仓；**本仓只写 website 域 Lua 行为层，不碰引擎 Rust，不复制库 B 包的内部逻辑**。

engine↔package 契约的权威是 fkst-substrate 的 `docs/package-repo-contract.md`；包结构约定（flat vs composed、core.lua 包内共享、composed.deps、schema/dedup_key、出站 dry-run 姿态开关）与 fkst-packages 的 `CLAUDE.md` 一致，此处不复述。

## 本仓特有约定

- **三档扩展模型**（见 README）：Tap 旁路 → Adapter 接线 → 静态 rebind（不存在，逢真需求向 fkst-substrate 提案）。**不做运行时拦截**；插入环节必须是一等显式 department。
- **跨仓组合**：引用库 B 的包 = pin git ref + 额外 `--package-root`；包间不跨 require，只经 `pkg.queue` 限定名集成。
- **写姿态**：站点发布的唯一姿态开关是 `FKST_SITE_WRITE`（unset = dry-run，`1` = 真写，真写要求 `FKST_SITE_PUBLISH_ROOT`，缺失 fail-closed）。
- **payload 宪法**：大体量内容绝不整体序列化进可靠投递 payload；payload 只承载 `source_ref` 指针 + 小控制字段，consumer 回源 fetch。

## 目录结构：网站源码主仓（与 Lua 主仓 fkst-packages 有意不同）

本仓是**网站源码主仓**，fkst-packages（库 B）是 **Lua 主仓**——两者目录结构按**语言主属性**有意分开，不是不一致：

- **库 B（Lua 主）**：整个仓就是 Lua，committed Lua 源码放根 `packages/<pkg>/`；`scripts/run.sh` 生成 `.fkst/local-packages -> ../packages` 作为引擎加载的运行时视图（gitignore）。Lua 放根天经地义。
- **本仓（网站源码主）**：仓库根是**网站源码**（`site/` 等），**Lua 包不放根**——本仓自有 Lua 包 committed 在 **`.fkst/local-packages/<pkg>/`**，让根保持纯网站源码、Lua 收进引擎运行时命名空间。引擎直接从 `.fkst/local-packages` 加载（committed home，无需生成步骤）。
- **`.fkst/` 是运行时接口目录，本就 tracked + ignored 混合，不是「全 runtime-generated」**：每个 fkst 仓的 `.fkst/` 都**已 tracked** `.fkst/env.example` 与 substrate source-pin，只 **ignore** `.fkst/run/`、`.fkst/env`、外部引用包落点 `.fkst/packages/`。本仓（host）在这个既有事实上**additionally track** `.fkst/local-packages/`（本仓自有 Lua 包）+ `.fkst/std/`（本仓自定义 std，见下）。因为 `.fkst/` 从来就不是纯运行时，把 committed Lua 源码放进 `.fkst/` 与既有的 tracked 配置**完全一致、无任何代价**——只是语言主属性不同导致 tracked 集合不同。
  - 本仓 `.gitignore`：**track** `.fkst/local-packages/`、`.fkst/std/`、substrate source-pin、`.fkst/env.example`；**ignore** `.fkst/packages/`、`.fkst/run/`、`.fkst/env`。
  - 对比库 B（Lua 主）：`.fkst/local-packages` 在库 B 是 **ignore**（`-> ../packages` 的生成视图）；在本仓是 **track**（committed Lua 的家）。同一路径、相反 git 状态，皆因语言主属性——这是设计，明确写在此以免误删。
- **跨仓组合（已有规则，重申）**：引用库 B 的包 = pin git ref + 额外 `--package-root`，只经 `pkg.queue` 限定名集成，**不跨 require**。
- **迁移状态**：当前 `site-board` 仍在根 `packages/`（旧布局）；按本规则迁到 `.fkst/local-packages/site-board/`（连带 `scripts/run.sh` 的 `--package-root` 与 `.gitignore` 调整）是后续实现步骤，本节先把目标规则写明。

## stdlib：库 B 的 std 私有 / 库 C 自定义 std

- **不引用库 B 的 std**：库 B 的 `std` 是**库 B 私有的仓内共享库**，**不是「全局 FKST stdlib」**。库 C 与库 B 只经 queue 集成、不跨 require，因此**不消费**库 B 的 std。仅当库 B **显式把某部分 std 提升为「命名的、带版本的 public 平台 API」**时，库 C 才经**显式 external-lib 机制**引用，且用 `platform_std` 之类**明确归属**的名字（不叫 `std`，不用跨 repo 相对 symlink「spelunking」）。
- **库 C 自定义 std**：就是本仓自己的仓内共享库——`.fkst/std/<module>.lua`（committed）+ 每个需要的 C 包一条 per-package 相对 symlink `.fkst/local-packages/<pkg>/std -> ../../std`，`require("std.<module>")`。**零新机制**，与 Lua 主仓的 per-repo 模式相同，版本无关（随本仓走）。C 包可**同时**用「库 B 包（经 queue/package-root）」+「C-std（经 require）」——两个平面不冲突；但**不能**把 live B-std 与 live C-std 当成两个都叫 `std` 的可 require 根（一个 package root 只有一个 `std` 命名空间）。
- **何时才需要引擎 `--lib-root`**：仅当某个 C 包必须在**同一个包内**同时 require「命名的库 B 平台 std（已提升为 public）」**和**「C 自己的 std」——两个独立命名的共享根，不能都叫 `std`；且**必须先有库 B 主动把 std 提升为 public 平台库**。在那之前不触发（YAGNI）。

## 构建 / 测试

- `cp env.example .env` 填 `BIN=<fkst-substrate>/target/debug/fkst-framework`。
- `scripts/run.sh test [pkg]` 单一入口（self-test + flat conformance + test + 组合 conformance）；`scripts/run.sh check` 静态守卫。
- CI 从 `.fkst-substrate-ref` source-pin checkout 引擎并构建。

## Git 提交/分支规范

与 fkst-packages 一致：集成/默认分支 `dev`，不直接向 `dev` 提交；分支名 `<type>/<kebab-topic>`（`feat|fix|docs|chore|refactor|test`）；提交 subject 一行中文祈使句；PR 标题中文、正文含动机/改动/测试证据，CI 绿才合，squash 保持线性；AI 生成的对外文本末尾保留 `⟦AI:FKST⟧`。

## 纪律

- 单个源代码文件 ≤1000 行，硬上限。
- 不留 deprecated shim / compat layer / `.old` / `_legacy`；改契约就改完整。
- 不要历史兼容：系统只有当前态一种形态；可关的运行姿态用 host 环境事实表达，不在代码里留双模式分叉。
- 错误分类要窄；日志/commit/event payload 可 grep。
- 引擎 Rust 改动属 fkst-substrate 仓；库 B 包改动属 fkst-packages 仓。

⟦AI:FKST⟧
