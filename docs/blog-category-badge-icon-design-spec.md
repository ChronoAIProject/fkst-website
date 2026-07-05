# Blog Category Badge Icon Design Spec

## Scope

This note specifies the reusable visual contract for small blog category
badges and their optional icons. It is a handoff brief for a later asset or UI
implementation pass; it does not create final icon assets, add blog templates,
or define a broader fkst brand system.

The initial taxonomy is limited to `news`, `release`, and `deep-dive`.

## Design Source

No dedicated `DESIGN.md`, brand guideline, blog index template, or badge
component exists in this repository today. This spec therefore uses the
existing design notes in `docs/`, the live color tokens in
`site/src/assets/css/style.css`, and the current card and article patterns in
`site/src/index.njk` and `site/src/_includes/layouts/article.njk` as the
available local source of truth.

The governing design practice is a design-system component contract: category
badges should have stable semantics, text-first accessibility, token-based
states, fixed dimensions, and explicit icon-use rules before visual assets are
produced.

## Purpose

Blog category badges help users distinguish post types at scan speed on the
blog index. The label is the semantic source of truth; the icon reinforces the
category only when it improves recognition in a compact list or card.

The badge system should make these categories readable without turning the
post list into decoration:

- `news`: time-sensitive project updates, ecosystem notes, or announcements.
- `release`: shipped version, deployment, package, or site changes.
- `deep-dive`: longer technical explanation, architecture analysis, or
  implementation write-up.

## Component Contract

- Each badge must include a visible text label such as `News`, `Release`, or
  `Deep dive`.
- Icons are decorative when the text label is visible and should be marked
  `aria-hidden="true"` in the final implementation.
- Do not rely on icon shape or color alone to communicate the category.
- A post may show one primary category badge in the blog index. If future posts
  need multiple taxonomy values, use one category badge plus separate metadata
  text rather than stacking several icon badges.
- Badge labels and icon mappings should be deterministic from category data;
  do not use free-form per-post artwork.

The intended DOM shape for a future implementation is:

```html
<span class="blog-category-badge blog-category-badge--release">
  <span class="blog-category-badge-icon" aria-hidden="true">...</span>
  <span class="blog-category-badge-label">Release</span>
</span>
```

## Visual Style

- Badge shape: compact rounded rectangle with a restrained `6 px` radius, a
  `1 px` border, and a soft background field. Avoid pill shapes unless the
  surrounding blog card system already uses fully rounded metadata chips.
- Icon treatment: monoline outline icons on a shared grid, drawn with
  `currentColor` strokes and no filled pictograms.
- Stroke: `1.75 px` default stroke, rounded caps, and rounded joins. Use
  `2 px` only when pixel snapping is required at the smallest rendered size.
- Detail level: icons must remain legible at `14 x 14 px`; use no more than
  two primary visual elements per icon.
- Typography: label text should use the site's existing sans-serif stack,
  `0.78rem` to `0.82rem` size, and `700` to `800` weight. Letter spacing stays
  `0`.
- Density: badges should read as metadata, not calls to action. Keep their
  contrast clear but quieter than the post title.

## Category Metaphors

| Category | Icon metaphor | Shape details |
| --- | --- | --- |
| `news` | Broadcast marker or compact signal post | Small central dot with two short signal arcs or a simple bulletin mark. It should imply an update, not social media or breaking-news urgency. |
| `release` | Version tag with shipped check | Compact tag or package tile with a small check mark. It should imply a completed release, not a shopping label. |
| `deep-dive` | Layered detail or magnified section | Two stacked lines or layers with a small lens or focus mark. It should imply deeper analysis, not generic search. |

## Dimensions And Spacing

- Source asset grid: `24 x 24 px`.
- Intended icon render size: `14 x 14 px` inside the badge.
- High-DPI source: keep vector SVG masters on the `24 x 24 px` grid. If raster
  exports are ever needed, export at `2x` and `3x`.
- Badge minimum height: `26 px` on desktop and compact tablet layouts.
- Badge compact height: `24 px` on narrow screens only when the post card
  metadata row is space-constrained.
- Badge padding: `5 px 8 px` with an icon, or `5 px 9 px` for a text-only
  fallback.
- Icon-label gap: `5 px`.
- Internal alignment: center icon and label on the same inline axis. The badge
  must not change the post title line-height or card rhythm.
- Metadata gap: keep at least `8 px` between the badge and adjacent metadata
  such as date or reading time.

## Responsive Behavior

Show the visible label at all supported viewport widths. Do not collapse the
badge to icon-only on mobile because category names are short and text remains
the accessible, localized meaning.

If a blog card becomes too narrow for the full metadata row, wrap the metadata
after the badge or move secondary metadata to the next line. Do not truncate
category labels unless a future localized label exceeds the badge's available
width; in that case, prefer a shorter translation over an ellipsis.

## Color Palette

Use the existing CSS tokens as the palette anchor and add only category accent
aliases derived from them in a future implementation.

| Role | Light surface | Dark surface | Token usage |
| --- | --- | --- | --- |
| Badge background | Soft accent field | Soft accent field | `background: var(--accent-soft)` |
| Badge border | Neutral line mixed with accent | Neutral line mixed with accent | `border-color: color-mix(in srgb, var(--accent) 38%, var(--line))` |
| Badge text and icon | Strong accent | Strong accent | `color: var(--accent-strong)` |
| Hover | Slightly stronger field and border | Slightly stronger field and border | Increase `var(--accent)` share in border/background mixes only when the whole post card is hovered |
| Focus | Existing focus ring | Existing focus ring | `outline: 3px solid var(--focus)` on the linked post card or badge link, not on the icon |

Per-category accent guidance should remain subtle:

| Category | Accent guidance |
| --- | --- |
| `news` | Use the default site accent tokens without introducing a second hue. |
| `release` | Use the same accent family with a slightly stronger border mix to suggest completion. |
| `deep-dive` | Use the same accent family with a quieter background mix so long-form analysis does not overpower titles. |

The badge system must not introduce a new dominant hue family. Category
differentiation comes from label text and icon metaphor first, with token
mixes as secondary reinforcement.

## Exact Site Placement

Place the badge in each blog index post list item or card, above the post title
and before secondary metadata. The preferred order is:

```text
Category badge
Post title
Date, reading time, and other metadata
Excerpt
```

If the future blog index uses a horizontal metadata row, place the badge as the
first item in that row, immediately before the date and reading time. Align the
badge's vertical center with the metadata text baseline optically, while
keeping the post title as the dominant scan target.

The badge belongs only to blog index summaries and any future related-post
cards. It should not be repeated in the article body when the article header
already names the category in text.

⟦AI:FKST⟧
