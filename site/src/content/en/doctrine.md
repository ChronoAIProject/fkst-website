---
pageKey: doctrine
lang: en
title: Doctrine | fkst
description: "Selected fkst doctrine highlights: marker-as-fact, codex-judgment gates, host write posture, and one current system shape."
eyebrow: Doctrine highlights
heading: A small set of rules keeps autonomy legible.
intro: fkst favors durable facts, explicit gates, and current-state design. These highlights are selected doctrine, not a complete contract.
---

## Markers are facts

GitHub is eventually consistent, so fkst writes marker records as facts and uses version-CAS style claims around them. The marker is not decorative metadata; it is the observable state a later worker can read, compare, and advance.

## Gates judge pipelines

Gates are codex-judgment pipelines over the work product and evidence. They are not per-event human labels sprinkled through the queue. The review is explicit, repeatable, and tied to the proposal or delivery stage being judged.

Write posture is also explicit. The website package has one host environment fact for publishing: FKST_SITE_OUT selects the data artifact directory, and generated site-board data never writes into hand-authored site source.

## One current shape

fkst does not keep backward-compatibility modes, deprecated shims, or speculative branches in the system. When the contract changes, the current shape changes with it.

New patterns must serve a proven present problem. The bias is to keep the runtime and packages small enough that every visible mechanism earns its place.
