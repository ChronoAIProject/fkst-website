---
pageKey: architecture
lang: en
title: Architecture | fkst
description: "Architecture overview for fkst: company tiers, reliable delivery, and the three-repo package ecosystem."
eyebrow: Architecture overview
heading: A company-shaped runtime over durable events.
intro: fkst keeps the engine, shared packages, and website-domain behavior in separate repositories while the runtime unions package roots into one explicit department graph.
---

## Company model

Work is modeled as Company, Department, and Person. A company owns the durable graph, departments declare concrete responsibilities, and persons are spawned workers that execute bounded tasks.

- Sources raise events from outside facts such as GitHub issues or timers.
- Fanout gives multiple departments the same fact without runtime interception.
- Routing selects the next department, spawn creates work, and RAISED records the resulting events.

## Reliable delivery

Delivery is redb-backed and treats retries as normal operation: events are delivered at least once until acknowledged, leases and fencing keep workers from racing stale ownership, and DLQ records preserve failures for inspection.

Large content does not ride inside reliable payloads. Payloads carry a source_ref pointer plus small control fields, and consumers re-fetch the authoritative content when they need it.

## Repository ecosystem

The ecosystem is split into three public repositories. The fkst-substrate repo owns the engine and package contract, fkst-packages owns reusable package patterns, and fkst-website adds only website-domain Lua behavior.

Packages can be flat or composed. A composed package references dependencies through declared composition, and the engine receives one graph by unioning the pinned package roots supplied at runtime.
