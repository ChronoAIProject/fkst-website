---
pageKey: doctrine
lang: zh-Hans
title: 信条 | fkst
description: fkst 信条重点：marker-as-fact、codex-judgment gate、host 写姿态，以及唯一当前形态。
eyebrow: 信条重点
heading: 少量规则让自治保持可读。
intro: fkst 偏向持久事实、显式 gate 和当前态设计。这里是精选信条，不是完整 contract。
---

## Marker 是事实

GitHub 是 eventually consistent 的，因此 fkst 把 marker record 写成事实，并围绕它们使用 version-CAS 风格的 claim。marker 不是装饰性 metadata；它是后续 worker 可读取、比较、推进的可观察状态。

## Gate 判断流水线

gate 是对工作产物与证据进行 codex judgment 的 pipeline，而不是撒在 queue 上的逐 event 人工 label。review 必须显式、可重复，并绑定到被判断的 proposal 或 delivery stage。

写姿态同样显式。website package 的数据输出只有一个 host 环境事实：FKST_SITE_OUT 选择 data artifact 目录，生成的 site-board 数据绝不写入人工维护的 site source。

## 唯一当前形态

fkst 不保留 backward-compat mode、deprecated shim 或 speculative branch。contract 改变时，系统的当前形态也随之完整改变。

新模式必须服务已经证明存在的当前问题。默认倾向是保持 runtime 与 package 足够小，让每个可见机制都真正有用。
