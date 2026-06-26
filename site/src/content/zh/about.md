---
pageKey: about
lang: zh-Hans
title: 关于 FKST | fkst
description: FKST 自主公司运行时的简要介绍。
eyebrow: 关于 fkst
heading: FKST 是一个自主公司运行时。
intro: 它围绕显式队列、package 拥有的 department 和确定性投递记录构建。
---

## 它是什么

fkst 把软件交付建模为公司形态的 runtime。department 拥有狭窄职责，event 承载小控制事实，worker 通过显式 queue 推进 proposal。

## 网站边界

这个网站现在是常规 Astro 项目。人工维护的页面、layout 和静态资源都在 web source tree 中；FKST runtime package 可以在 hand-authored `site/` 之外生成 data artifact。

## 当前重点

公开视频站点解释架构、信条和三仓拆分；board 或 release view 这类 data-driven page 以后作为普通 framework build step 添加。
