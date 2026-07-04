# Issue 188 Viewport Evidence

## Scope

Issue 188 reported oversized text. The implementation changes only the existing
`h1`, `.hero h1`, `.page-header h1`, and mobile `h1` rules in
`site/src/assets/css/style.css`. This note records the before/after viewport
evidence for those affected heading surfaces.

## Method

- Built the site with `cd site && npm run build`.
- Created two local snapshots from the generated `_site` output.
- Used the target-branch stylesheet from
  `403ebf5a74d209e7a52c631911be61992835b468:site/src/assets/css/style.css`
  for the before snapshot.
- Used the current PR stylesheet for the after snapshot.
- Served both snapshots under the production base path `/fkst-website/`.
- Measured rendered `h1` geometry in Chromium at `375x812`, `768x1024`,
  and `1280x720`.

## Measurements

All after rows had `horizontalOverflow=false` and `viewportFit=true`.

| Route | Affected selector | Viewport | Before | After |
| --- | --- | --- | --- | --- |
| `/fkst-website/` | `h1`, `.hero h1` | `375x812` | `71.25px`, 6 lines, `393.28px` tall | `39.38px`, 4 lines, `154.31px` tall |
| `/fkst-website/zh/` | `h1`, `.hero h1` | `375x812` | `71.25px`, 5 lines, `327.73px` tall | `39.38px`, 3 lines, `115.73px` tall |
| `/fkst-website/architecture.html` | `h1`, `.page-header h1` | `375x812` | `43.2px`, 4 lines, `158.94px` tall | `39.2px`, 4 lines, `153.63px` tall |
| `/fkst-website/zh/architecture.html` | `h1`, `.page-header h1` | `375x812` | `43.2px`, 3 lines, `119.2px` tall | `39.2px`, 2 lines, `76.81px` tall |
| `/fkst-website/` | `h1`, `.hero h1` | `768x1024` | `92.16px`, 4 lines, `339.13px` tall | `69.12px`, 3 lines, `203.2px` tall |
| `/fkst-website/zh/` | `h1`, `.hero h1` | `768x1024` | `92.16px`, 3 lines, `254.34px` tall | `69.12px`, 3 lines, `203.2px` tall |
| `/fkst-website/architecture.html` | `h1`, `.page-header h1` | `768x1024` | `61.44px`, 3 lines, `169.55px` tall | `49.15px`, 2 lines, `96.34px` tall |
| `/fkst-website/zh/architecture.html` | `h1`, `.page-header h1` | `768x1024` | `61.44px`, 2 lines, `113.03px` tall | `49.15px`, 2 lines, `96.34px` tall |
| `/fkst-website/` | `h1`, `.hero h1` | `1280x720` | `118.4px`, 6 lines, `653.53px` tall | `92.8px`, 5 lines, `454.69px` tall |
| `/fkst-website/zh/` | `h1`, `.hero h1` | `1280x720` | `118.4px`, 5 lines, `544.61px` tall | `92.8px`, 4 lines, `363.75px` tall |
| `/fkst-website/architecture.html` | `h1`, `.page-header h1` | `1280x720` | `92.8px`, 3 lines, `256.08px` tall | `76.8px`, 3 lines, `225.75px` tall |
| `/fkst-website/zh/architecture.html` | `h1`, `.page-header h1` | `1280x720` | `92.8px`, 2 lines, `170.72px` tall | `76.8px`, 2 lines, `150.5px` tall |

## Result

The reduced responsive clamps lower the rendered heading size at each affected
breakpoint while preserving viewport fit and avoiding horizontal overflow.

⟦AI:FKST⟧
