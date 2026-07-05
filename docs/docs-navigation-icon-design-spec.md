# Docs Navigation Icon Design Spec

## Scope

This note specifies the concept for a small docs navigation line-icon set only.
It is a handoff brief for a later asset or UI implementation pass; it does not
create final icon assets, wire icons into templates, or define a broader fkst
brand system.

## Design Source

No dedicated `DESIGN.md`, brand guideline, or icon system exists in this
repository today. This spec therefore uses the current site tone in
`site/src/index.njk`, the article navigation behavior in
`site/src/_includes/components/DocsSidebar.njk`, and the live color tokens in
`site/src/assets/css/style.css` as the available local source of truth.

The governing design practice is an icon-system contract: each icon should
have a stable semantic role, a shared grid and stroke model, token-based
states, and explicit accessibility behavior before final assets are produced.

## Purpose

The icon set helps users scan the top-level docs navigation sections without
turning the navigation into decoration. The icons should make the three
sections feel like parts of one operational system:

- `getting-started`: entry, first successful path, and activation.
- `guides`: repeatable workflows and applied procedures.
- `reference`: precise lookup, contracts, and stable facts.

The icons should support the fkst brand as calm, explicit, and operational.
They should read as durable navigation signals rather than marketing
illustrations.

## Visual Style

- Form: monoline outline icons on a `24 x 24 px` grid, drawn with simple
  geometric strokes and no filled pictograms.
- Stroke: `1.75 px` default stroke, rounded caps, and rounded joins. Use a
  maximum `2 px` stroke only if pixel snapping requires it at small sizes.
- Corners: restrained corner radii, visually aligned with the site's practical
  interface tone. Avoid bubbly, mascot-like, or highly decorative shapes.
- Detail level: each icon should remain legible at `18 x 18 px`; avoid more
  than three primary visual elements per icon.
- Metaphor family: use paths, nodes, pages, gates, and lookup marks that echo
  fkst concepts such as explicit queues, package-defined departments, durable
  markers, and consensus gates.

## Section Metaphors

| Section | Icon metaphor | Shape details |
| --- | --- | --- |
| `getting-started` | Start node flowing into a first gate | Small origin dot, short path, and a doorway or gate outline. The path should point rightward to imply a first run, not a rocket or generic launch symbol. |
| `guides` | Workflow path through ordered steps | Three compact step nodes connected by a bent line or lane. Keep the route visible and procedural; do not use a book-only metaphor because the section is task-oriented. |
| `reference` | Contract page with lookup mark | Document rectangle with two short rule lines and a small corner magnifier or index mark. The icon should imply exact lookup, not a general article. |

## Dimensions And Spacing

- Master grid: `24 x 24 px`.
- Intended rendered size: `20 x 20 px` on desktop docs navigation.
- Compact rendered size: `18 x 18 px` on narrow screens when navigation space
  is constrained.
- Internal padding: keep visible strokes inside a `20 x 20 px` live area,
  leaving `2 px` optical padding on all sides of the `24 x 24 px` grid.
- Link gap: place `8 px` between the icon and its text label on desktop, and
  `6 px` on compact navigation.
- Alignment: align icon centers to the first line of the section label. Do not
  let icons change the line-height or vertical rhythm of navigation rows.
- Hit target: the icon is part of the existing navigation link hit area; it
  must not become a separate interactive target.

## Responsive Behavior

On desktop, show each icon inline before its section label in the docs
navigation. On narrow screens, keep the icon visible when labels remain visible;
if a future compact mode hides text labels, keep the same semantic order and
provide the label through the link accessible name rather than through the icon.

Icons should be decorative for assistive technology when the adjacent text
label is present. Mark final assets or wrappers as `aria-hidden="true"` in that
case so section names are not announced twice.

## Color Palette

Use the existing CSS tokens as the only palette source:

| State | Light surface | Dark surface | Token usage |
| --- | --- | --- | --- |
| Default | Muted line icon | Muted line icon | `color: var(--muted)` |
| Hover | Strong accent line icon | Strong accent line icon | `color: var(--accent-strong)` |
| Active/current | Accent line icon plus optional soft field | Accent line icon plus optional soft field | `color: var(--accent-strong)` with `background: var(--accent-soft)` only if the nav item already has an active surface |
| Focus | Keep state color and use focus ring | Keep state color and use focus ring | `outline: 3px solid var(--focus)` on the link, not the icon |
| Disabled/unavailable | Lower-contrast muted line | Lower-contrast muted line | `color-mix(in srgb, var(--muted) 62%, transparent)` |

The icon set must not introduce a new dominant hue family. Use `currentColor`
for strokes so icons inherit navigation link states in light theme, dark theme,
and print-safe contexts.

## Exact Site Placement

Place these icons in the docs navigation section list for the top-level docs
sections `getting-started`, `guides`, and `reference`, immediately before each
section label inside the section link.

The intended DOM shape for a future implementation is:

```html
<a class="docs-nav-section-link" href="/docs/getting-started/">
  <span class="docs-nav-section-icon" aria-hidden="true">...</span>
  <span class="docs-nav-section-label">Getting started</span>
</a>
```

This placement is separate from the current article table-of-contents sidebar
implemented by `site/src/_includes/components/DocsSidebar.njk`. The icons
belong to docs section navigation, not to per-page heading links under "On this
page".
