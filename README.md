# fkst-website

The public fkst website and the website-domain data packages that support it.
The website itself is a normal Astro static-site project under `site/` with no
fkst engine involvement in page generation. Website-domain Lua packages remain
under `.fkst/local-packages/` only for data artifacts such as the board snapshot.

This repo is **English-primary, zh-en bilingual**: source files are English; external artifacts (docs, issues, PRs) are English-first with Chinese as a secondary layer; the site itself is English-first with a Chinese version.

（中文：fkst 生态第三仓（库 C），website 域 Lua 包库，组合库 B 的包开发；本仓英文为主、中英双语。）

官方网站：https://chronoaiproject.github.io/fkst-website/

## Website build

`site/` is an Astro project selected for static output, Markdown page authoring,
documented i18n routing, and room for later data-driven pages through ordinary
build-time inputs. Source pages live in `site/src/pages/`, shared layouts live in
`site/src/layouts/`, and static assets live in `site/public/`.

```sh
cd site
npm ci
npm run build
cd ..
scripts/probe_built_site.sh site/_site
```

The build artifact is `site/_site/` so the existing GitHub Pages upload and
`probe_site.sh` / `probe_built_site.sh` gates keep checking the deployed URL
contract. The tracked `site/probe-manifest` is the list of pages that must stay
servable.

## 仓定位与扩展模型

The runtime package side of this repo follows the same engine↔package contract
as fkst-packages (authority: fkst-substrate `docs/package-repo-contract.md`).
对库 B 包的复用按三档扩展力度，从低往高用，逢真需求才升级：

| 档位 | 机制 | 状态 |
|---|---|---|
| 1. Tap（旁路观察） | 本仓包额外消费库 B 包的 `pkg.queue`（fanout 多消费者），原流不变 | 引擎已支持 |
| 2. Adapter 接线 | composed 包把库 B 的输出 port 经本仓 adapter dept 接到下游（autochrono 范式） | 引擎已支持 |
| 3. 静态 rebind 声明 | 基础包声明某条边 rebindable，composed 包静态改接线 | 不存在；攒够档位 2 表达不了的真实案例再向 fkst-substrate 提案 |

**不做运行时拦截**：插入的中间环节必须是一等显式 department（有自己的 spec / dedup / source_ref 纪律，graph scan 可见）。接线透明（A/B 不感知对端）是设计目标；投递语义透明（provenance / 幂等 / retry 不变）做不到也不假装。

跨仓引用库 B 的包 = pin 住 fkst-packages 的 git ref + supervise 时把其包目录作为额外 `--package-root` 传入（多 package-root union 是引擎一等能力）。

## 包

- `.fkst/local-packages/site-board/` (composed): site data source v0. A cron poll reads `FKST_GITHUB_REPO` open issues and open PRs, then builds the `fkst.site.board.v1` snapshot JSON. The output directory comes from `FKST_SITE_OUT`, defaults to `build/fkst/data`, and receives atomic `fkst.site.board.v1.json` and `manifest.json` writes through tmp-file rename. It never writes to hand-authored `site/`. Astro can later consume these artifacts as ordinary build-time data inputs.

## 构建 / 测试

```sh
cp env.example .env   # 填 BIN=<fkst-substrate>/target/debug/fkst-framework
scripts/run.sh test   # self-test + conformance + 全部包测试
scripts/run.sh check  # pinned shared source ratchets + engine host conformance
```

CI 从 `.fkst-substrate-ref`（git source-pin）checkout 引擎源码并构建 fkst-framework，再跑 `scripts/run.sh check` 和 `scripts/run.sh test`。

## Shared conformance

This repo does not carry a local `scripts/check_repo.py` copy. Source ratchets
come from a `ChronoAIProject/fkst-packages` checkout pinned by
`fkst.lock`:

- The fkst-substrate source pin remains `.fkst-substrate-ref`.
- The fkst-packages platform pin is
  `fkst.lock` `external_source(id=fkst-packages-platform).resolved.rev`.
- Host conformance config lives under `.fkst/conformance/`.
- Host allowlists: `.fkst/conformance/allowlists/`
- Engine package roots: `.fkst/compose/package-roots`
- Hydrated checkout: `.fkst/run/fkst-packages-platform/` (ignored)

There is no separate per-repo dot-conformance directory and no copied ratchet
infrastructure in this repo.

To bump the shared ratchets, update `fkst.workspace.toml`
`external_source(id=fkst-packages-platform).rev` to the new full
fkst-packages commit SHA, verify that SHA exists on the intended upstream
branch, regenerate `fkst.lock` with `fkst-framework deps lock`, remove
`.fkst/run/fkst-packages-platform/`, then run `scripts/run.sh check` and
`scripts/run.sh test`.

## 约定

与 fkst-packages 一致：源文件内部英文、对外产物中文；事件 payload 只带 `source_ref` + 小控制字段（内容不入 payload，consumer 回源 fetch）；site-board 生成物只写入 `FKST_SITE_OUT`（默认 `build/fkst/data`），不写入 hand-authored `site/`；site page generation stays in Astro, not FKST engine departments；集成/默认分支 `dev`，PR 合并用 squash。

⟦AI:FKST⟧
