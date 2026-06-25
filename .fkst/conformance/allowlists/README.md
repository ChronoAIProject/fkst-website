# fkst-website source ratchet allowlists

This directory is passed to the shared fkst-packages source ratchet runner as
`--allowlist-dir`.

Files here are host-local source ratchet baselines required by the published
shared runner. Add entries only for existing repo-specific debt, and remove
them as the underlying debt is fixed.

The runner itself is not copied into this repo; `scripts/run.sh check` hydrates
the pinned fkst-packages platform source recorded in `fkst.lock`.

⟦AI:FKST⟧
