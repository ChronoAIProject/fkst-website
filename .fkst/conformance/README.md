# Shared Conformance

fkst-website invokes the shared source ratchets from
`ChronoAIProject/fkst-packages` instead of carrying a local copy.

Convention:

- Cross-repo version pins are top-level source pins:
  `.fkst-substrate-ref` for the engine and `fkst.lock`
  `external_source(id=fkst-packages-platform).resolved.rev` for platform packages.
- Host conformance config lives under `.fkst/conformance/`.
- Allowlists live in `.fkst/conformance/allowlists/`.
- Engine package roots live in `.fkst/compose/package-roots`.
- Hydrated shared ratchet source is recreated under
  `.fkst/run/fkst-packages-platform/` (ignored).
- There is no per-repo `.conformance/` directory and no copied ratchet
  infrastructure in this repo.

To bump the shared ratchets, update `fkst.lock` `external_source(id=fkst-packages-platform).resolved.rev` to the
new full fkst-packages commit SHA, verify that SHA exists on the intended
upstream branch, remove `.fkst/run/fkst-packages-platform/`, then run:

```sh
scripts/run.sh check
scripts/run.sh test
```

The pin is a commit SHA on purpose: CI and local runs must not silently drift to
whatever `dev` points at that day.

⟦AI:FKST⟧
