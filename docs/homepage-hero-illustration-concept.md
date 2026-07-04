# Homepage Hero Illustration Concept

## Scope

This note specifies the concept for a homepage hero illustration only. It is a
handoff brief for producing the final visual asset; it does not define final
artwork, site implementation, or a broader fkst brand system.

## Design Source

No dedicated `DESIGN.md`, brand guideline, or illustration system exists in
this repository today. This concept therefore uses the current homepage
message in `site/src/index.njk` and the live color tokens in
`site/src/assets/css/style.css` as the available local source of truth.

## Purpose

The hero graphic should communicate fkst as an autonomous company runtime:
durable events enter a visible system, package-defined departments process
work through explicit queues, and consensus gates turn GitHub issues into an
auditable issue-to-merge loop.

The visual should support the headline "fkst is a fully autonomous
agent-company system." without restating it. It should make the system feel
structured, inspectable, and operational rather than magical, opaque, or
decorative.

## Visual Style

- Composition: an abstract operating map with three visible layers: incoming
  work signals, department or package nodes, and gated output toward merge or
  publication. Use clear directional paths between nodes so the illustration
  reads as a workflow at a glance.
- Mood: calm, precise, and technical. The system should feel reliable and
  intentionally governed, not futuristic for its own sake.
- Abstraction level: semi-abstract. Use labeled or label-like forms sparingly,
  such as queue lanes, event markers, gates, and package tiles, but avoid UI
  screenshots or literal robot imagery.
- Distinctiveness: avoid generic cloud-network art, floating dashboards,
  isometric server racks, neon brain motifs, and random connected dots. The
  fkst-specific signal is the combination of explicit queues, package-defined
  departments, durable markers, and consensus gates.
- Shape language: use crisp lines, modest depth, and compact rectangular or
  lane-like forms. Keep corners restrained and match the site's existing
  practical interface tone.

## Dimensions

- Desktop source canvas: `2400 x 1200 px` at `2x` working resolution.
- Desktop export: `1200 x 600 px`, optimized for the homepage hero banner.
- Mobile source canvas: `1600 x 1800 px` at `2x` working resolution.
- Mobile export: `800 x 900 px`, cropped or recomposed for narrow screens.
- Safe content area: keep essential forms inside the central `80%` of each
  canvas so the asset can sit beside or behind headline and CTA content without
  losing meaning.
- Delivery format: export final raster assets as `webp` or optimized `png`;
  keep the editable source file in the design tool used to produce the asset.

## Color Palette

Use the current site tokens as the palette anchor:

| Role | Light value | Dark value | Source token |
| --- | --- | --- | --- |
| Background | `#f8f7f2` | `#141619` | `--bg` |
| Surface | `#ffffff` | `#1d2226` | `--surface` |
| Primary text | `#161a1d` | `#f2f5f3` | `--text` |
| Neutral line | `#d9ded8` | `#35403b` | `--line` |
| Muted detail | `#53606a` | `#b0bbb7` | `--muted` |
| Primary accent | `#0f766e` | `#5eead4` | `--accent` |
| Strong accent | `#134e4a` | `#99f6e4` | `--accent-strong` |
| Soft accent field | `#d9f0eb` | `#173d39` | `--accent-soft` |

The illustration may add opacity and tint variations derived from these values,
but it should not introduce a new dominant hue family.

## Placement

The asset belongs in the homepage top banner or hero area, adjacent to the
existing headline, supporting paragraph, and repository CTA links. On desktop,
place the illustration as a right-side or full-bleed background companion that
does not reduce headline contrast or crowd the CTA row. On mobile, stack or
crop it below the opening copy so the headline remains the first readable
signal.

The final composition should leave quiet space near the headline side of the
hero, keep important detail away from CTA hit areas, and remain legible in both
light and dark theme contexts.

⟦AI:FKST⟧
