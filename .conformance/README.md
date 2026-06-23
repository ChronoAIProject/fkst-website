# Shared Conformance Pin

fkst-website invokes the shared source ratchets from
`ChronoAIProject/fkst-packages` instead of carrying a local copy.

- Pin file: `.conformance/fkst-packages.ref`
- Hydrated checkout: `.conformance/fkst-packages/` (ignored)
- Allowlists: `.conformance/check_repo.allowlists/`

To bump the shared ratchets, update `.conformance/fkst-packages.ref` to the
new fkst-packages commit, remove `.conformance/fkst-packages/`, then run:

```sh
scripts/run.sh check
scripts/run.sh test
```

The pin is a commit SHA on purpose: CI and local runs must not silently drift to
whatever `dev` points at that day.

⟦AI:FKST⟧
