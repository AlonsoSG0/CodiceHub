# chub curl install (releases + install.sh)

Turn the locally built binary into a published, anonymously installable artifact: CI builds the four desktop
targets on a tag, and one `curl | sh` line installs the right one into `~/.local/bin`.

## Specs

**S1 — Anonymous install, no token.** The user chose to make the repository public so the install path never needs
a credential. User words: "Hacer público el repo". Every download in `install.sh` is an unauthenticated GET against
GitHub: `raw.githubusercontent.com/<owner>/<repo>/main/install.sh` for the script and
`https://github.com/AlonsoSG0/CodiceHub/releases/...` for the artifacts. No token, no `gh` dependency.

**S2 — Four targets, built from one tag.** User words: "Los cuatro (linux/darwin × x64/arm64)". The release
publishes exactly these assets, gzipped, plus a checksum file:

- `chub-linux-x64.gz`
- `chub-linux-arm64.gz`
- `chub-darwin-x64.gz`
- `chub-darwin-arm64.gz`
- `SHA256SUMS`

**S3 — Update means re-running the script.** User words: "No: reinstalar con el script". The binary gains no
self-update code and no `upgrade` subcommand; `install.sh` replaces the binary in place and is safe to re-run.
The script exits with the installed version so a re-install is visibly a re-install.

**S4 — One line, verified, idempotent.**

```sh
curl -fsSL https://raw.githubusercontent.com/AlonsoSG0/CodiceHub/main/install.sh | sh
```

Behaviours: detects OS and arch from `uname`; downloads the matching `.gz` and `SHA256SUMS`; verifies SHA-256
before installing and refuses to install on a mismatch; decompresses; installs an executable `chub` into
`${XDG_BIN_HOME:-$HOME/.local/bin}` (override with `--dir` or `CHUB_INSTALL_DIR`); warns when the directory is not
on `PATH`; cleans its temporary directory on every exit path; `-h|--help` and `--version <v>` work; an unsupported
OS or architecture fails with a readable message and a non-zero exit.

**S5 — The tag is the version, and CI enforces it.** The workflow runs only on `v*` tags, and it aborts when the
tag does not equal the version in the root `package.json` — the single-source rule this repository already
follows. A release is created by CI; nothing is uploaded by hand.

**S6 — macOS is usable, not merely buildable.** Shipping darwin assets obliges the runtime to work there: the
browser opener stops hard-coding `xdg-open` and picks a command per platform, and a missing opener warns instead of
taking the server down.

**S7 — Testable without the network.** `install.sh` honours `CHUB_INSTALL_BASE_URL`, so its release paths can be
served from a local fixture in tests; the production URL stays the default and tests never reach GitHub.

**S8 — Out of scope.** Windows (`.ps1`), `chub upgrade`, Homebrew, npm publication, code signing, and any change to
the data home, migrations or the command surface.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S7, S4 | inline | none | Cover `install.sh` with tests against a local fixture: install, checksum refusal, unsupported platform, `--help` |
| T2 | S1, S4, S7 | inline | none | `install.sh` at the repository root |
| T3 | S2, S5 | inline | none | `.github/workflows/release.yml`: tag/version guard, four-target matrix, gzip, `SHA256SUMS`, `gh release create` |
| T4 | S6 | inline | none | Platform-aware browser opener in `cli/src/index.ts` |
| T5 | S1, S3, S4 | inline | none | README (and README.es.md) install section replacing "build it yourself" as the primary path |
| T6 | S2, S4 | inline | none | Prove it locally: cross-compile all four targets, then run `install.sh` end to end against a fixture |
| T7 | S1, S5 | parent | — | Delivery: commit, bump to 0.4.0, tag, push, flip the repository to public and watch the release |

## Log

L1 (user, verbatim): "sigamos con el curl, en que nos quedamos por decidir?"

L2 (user decisions, verbatim): "Hacer público el repo" / "Los cuatro (linux/darwin × x64/arm64)" / "No: reinstalar
con el script".

L3 (user, earlier, verbatim — the reason curl and not npm): "quiero curl porque no me quiero pelear con npm y sus
publicaciones ya lo hice antes y no quiero".

L4 (evidence, T1-T6 done): `install.sh` at the root (POSIX sh, 130 lines) and `.github/workflows/release.yml`
(guard → 4-target matrix → publish). `cli/src/open.ts` replaces the hard-coded `xdg-open`. Tests:
`cli/test/install-script.test.ts` (5, RED observed before the script existed) serves the release paths from a local
`Bun.serve` fixture and fakes `uname` through a PATH shim, so detection is proven for all four targets without the
host's platform; `cli/test/open.test.ts` (1) pins the three opener commands. `cd cli && bun test` → 28 pass, 0 fail;
`bun run typecheck` clean. Cross-compile proven locally: the four `bun build --compile --target=` outputs are a
linux x86-64 ELF, a linux aarch64 ELF and two Mach-O binaries (98/97/73/67 MB). End to end against a real release
served over local HTTP: checksum verified, mode 755, `--version` → 0.3.0, `/api/health` → `{"status":"ok"}`, deep
link → index.html 200. Piped execution proven: `cat install.sh | sh -s -- --help`.

L6 (independent verification, blocker found and closed): `gentle-ai-verify` returned pass on S1, S3, S5, S6, S7, S8 and the READMEs, unproven on S4 (signal cleanup, reinstall probes not executed), and one blocker on S2: the publish job checked that the four `.gz` arrived but not their `.sha256`, so `cat ./*.sha256` could merge an incomplete `SHA256SUMS` and publish it. Fixed: the arrival loop now requires `-s` on both `.<part>` files per asset, and a new step refuses to publish unless `SHA256SUMS` has exactly four lines and `sha256sum --check --strict` passes against the assets in place. Verified by running the three publish shells locally: all four present → 4 lines and every asset OK; one `.sha256` removed → blocked with `missing chub-darwin-arm64.sha256`; asset tampered after its checksum → blocked with `FAILED`; three-line `SHA256SUMS` → blocked. Also added the verifier's suggested regression test (`a rejected update leaves the existing installation untouched`), so `cd cli && bun test` is now 29 pass, 0 fail.

L5 (open, T7): delivery needs the user's go-ahead, because this repository commits only on request: commit the
work, bump the root `package.json` to 0.4.0, tag `v0.4.0`, push, flip the repository to public and let the workflow
publish. Until then the curl URL in the README points at a file that is only on disk.

L7 (post-delivery CI fixes, after the first two runs): the v0.4.0 run built all four targets and then failed in
`publish`, because that job has no checkout and `gh release create` cannot resolve a repository from `release/`;
the fix names it with `--repo "$GITHUB_REPOSITORY"`. No release had been published, so the user chose to cut 0.4.1
rather than move the tag; `v0.4.1` published and the anonymous `curl | sh` line installed a working 0.4.1.
Then the runner reported the Node 20 deprecation for the pinned actions: moved to the majors that run on node24
(checkout v7, setup-node v7, upload-artifact v7, download-artifact v8, pnpm/action-setup v6; setup-bun v2 was
already node24). Checked before moving: every input we pass still exists in the new major's `action.yml`, setup-node
v7 enables automatic caching only for npm and only when no explicit `cache:` is given, download-artifact v8 only
tightens digest mismatches into errors, and checkout's breaking change concerns `pull_request_target`, which this
tag-only workflow never uses. The bump is exercised by the next tag, not by the 0.4.1 run.

L8 (0.4.2, the release that finally carries the UI): after installing 0.4.1 the user reported seeing "the previous
one". Diagnosis, not a defect: `git diff --stat v0.3.0 v0.4.1 -- web/` is empty and the served chunk names match the
Oct 29 extraction byte for byte, because no commit between the two tags touched `web/` — the Home/Settings wave was
still uncommitted, so `pnpm dev` showed it and no release could. Answer to the user: it was 0.4.1 all along (the
process on :3000 ran the new binary, verified by the hash of `/proc/<pid>/exe`); the front end was identical.
Then, on the user's instruction, the wave was committed (theme default atripp, Home orbital backdrop, Settings brand
and version) after `pnpm --filter @chub/web test` (445 tests) and a root typecheck came back clean, and the installer
stopped leaving garbage: the server now drops every `runtime/<hash>` but its own on start (`pruneRuntime`), which
takes the six accumulated extractions from 19 MB back to 3.3 MB. `cd cli && bun run test` → 31 pass, 0 fail.
