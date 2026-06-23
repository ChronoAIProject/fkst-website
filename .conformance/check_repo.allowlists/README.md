# fkst-website source ratchet allowlists

This directory is passed to the shared fkst-packages source ratchet runner as
`--allowlist-dir`.

It is intentionally empty today: fkst-website carries no host-local source
ratchet waivers. Add files here only for repo-specific baselines required by
the published shared runner, and remove them as the underlying debt is fixed.

The runner itself is not copied into this repo; `scripts/run.sh check` hydrates
the pinned fkst-packages source recorded in `.conformance/fkst-packages.ref`.

⟦AI:FKST⟧
