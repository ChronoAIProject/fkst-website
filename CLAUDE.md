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
