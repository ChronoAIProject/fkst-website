# fkst-website

fkst 生态的第三个仓（库 C）：跑在 **fkst-substrate** 引擎上的 website 域 Lua package 库。它以 [fkst-packages](https://github.com/ChronoAIProject/fkst-packages)（库 B）的包为基础做组合开发，自身只承载 website 域的行为层。

## 仓定位与扩展模型

本仓遵循与 fkst-packages 相同的 engine↔package 契约（权威：fkst-substrate 的 `docs/package-repo-contract.md`）。对库 B 包的复用按三档扩展力度，从低往高用，逢真需求才升级：

| 档位 | 机制 | 状态 |
|---|---|---|
| 1. Tap（旁路观察） | 本仓包额外消费库 B 包的 `pkg.queue`（fanout 多消费者），原流不变 | 引擎已支持 |
| 2. Adapter 接线 | composed 包把库 B 的输出 port 经本仓 adapter dept 接到下游（autochrono 范式） | 引擎已支持 |
| 3. 静态 rebind 声明 | 基础包声明某条边 rebindable，composed 包静态改接线 | 不存在；攒够档位 2 表达不了的真实案例再向 fkst-substrate 提案 |

**不做运行时拦截**：插入的中间环节必须是一等显式 department（有自己的 spec / dedup / source_ref 纪律，graph scan 可见）。接线透明（A/B 不感知对端）是设计目标；投递语义透明（provenance / 幂等 / retry 不变）做不到也不假装。

跨仓引用库 B 的包 = pin 住 fkst-packages 的 git ref + supervise 时把其包目录作为额外 `--package-root` 传入（多 package-root union 是引擎一等能力）。

## 包

- `packages/site-board/`（flat）：站点数据源 v0。cron 轮询 `FKST_GITHUB_REPO` 的 open issue/PR 板面，构建 `fkst-website.board.v1` 快照 JSON；`FKST_SITE_WRITE=1` 且设置 `FKST_SITE_PUBLISH_ROOT` 时原子发布 `board.json`（写 tmp + mv），否则 dry-run 只记日志。

## 构建 / 测试

```sh
cp env.example .env   # 填 BIN=<fkst-substrate>/target/debug/fkst-framework
scripts/run.sh test   # self-test + conformance + 全部包测试
scripts/run.sh check  # 静态仓库守卫
```

CI 从 `.fkst-substrate-ref`（git source-pin）checkout 引擎源码并构建 fkst-framework，再跑 `scripts/run.sh test`。

## 约定

与 fkst-packages 一致：源文件内部英文、对外产物中文；事件 payload 只带 `source_ref` + 小控制字段（内容不入 payload，consumer 回源 fetch）；出站写默认 dry-run，真写姿态由 host 环境事实（`FKST_SITE_WRITE=1`）表达；集成/默认分支 `dev`，PR 合并用 squash。

⟦AI:FKST⟧
