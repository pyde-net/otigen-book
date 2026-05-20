# Appendix F — Tooling

The Otigen toolchain consists of two binaries: `otic` (the
compiler) and `pyde-dev` (the project tool), managed by a
third binary `otup` (the toolchain manager). This appendix
covers the CLI surface of each, the `pyde.toml` schema, and
IDE setup.

## `otup` (toolchain manager)

`otup` is the Otigen equivalent of `rustup` or `foundryup`. It
installs and updates the toolchain.

```sh
otup                            Install / update to the latest stable.
otup install <version>          Install a specific version (e.g. `otup install 0.2.1`).
otup install nightly            Install the latest nightly build.
otup update                     Update the toolchain to the latest stable.
otup list                       List installed versions.
otup default <version>          Set the default version.
otup uninstall <version>        Remove a specific version.
otup --version                  Print otup's own version.
```

`otup` itself is installed via the curl bootstrap covered in
[Chapter 1.1](ch01-01-installation.md):

```sh
$ curl -L https://install.pyde.network/otup | bash
```

> The installer infrastructure is part of the mainnet prep
> work and may not be deployed at the time you're reading.
> Until then, install `otic` and `pyde-dev` from source.

## `otic`

The compiler. Takes `.oti` source and produces `.json`
artifacts (PVM bytecode + ABI + metadata).

```sh
otic build <file.oti>           Compile .oti to .json bytecode artifact.
otic check <file.oti>           Type check without codegen.
otic test <file.oti>            Run #[test] functions on the embedded PVM.
otic abi <file>                 Print the ABI section of a .json artifact.
otic lex <file.oti>             Debug: dump the token stream.
otic --version, -V              Print version.
otic --help, -h                 Show help.
```

You'll rarely invoke `otic` directly; `pyde-dev build` runs it
across your `src/` tree. But it's useful for one-off compiles
and for inspecting artifacts. `otic test` lets you run a single
file's `#[test]` functions without the project scaffolding.

## `pyde-dev`

The project tool. Inspired by Cargo and Foundry. Provides
project scaffolding, build, test, deploy, format, console, and
network operations.

**Project lifecycle:**

```sh
pyde-dev init <name>            Scaffold a new project.
pyde-dev build                  Compile every .oti file under src/.
pyde-dev test [--filter X]      Run #[test] functions in test/.
pyde-dev fmt [--check]          Auto-format .oti files (--check exits non-zero on diff).
pyde-dev clean                  Remove out/ (build artifacts).
pyde-dev doc                    Generate docs from /// comments.
```

**Package management:**

```sh
pyde-dev install [url] [--rev R]  Install a package from a git URL, or restore from pyde.lock.
pyde-dev remove <name>            Remove an installed package.
```

**Network operations:**

```sh
pyde-dev deploy <file>:<C> --network <net>     Deploy a contract.
pyde-dev script <file>:<C> --network <net>     Run a deployment/migration script.
pyde-dev call    <addr> <fn>(<args>)  --network <net>  Read-only call (no tx, no signing).
pyde-dev send    <addr> <fn>(<args>)  --network <net>  State-changing tx (signed).
pyde-dev transfer <addr> <amount>     --network <net>  Native PYDE transfer.
pyde-dev tx       <txhash>            --network <net>  Check transaction status / receipt.
pyde-dev verify   <addr> <file>:<C>   --network <net>  Verify a deployed contract matches local source.
pyde-dev console  --network <net>     Interactive REPL.
```

**Wallet management:**

```sh
pyde-dev wallet new <name>              Generate a new keypair.
pyde-dev wallet import <name>           Import an existing key.
pyde-dev wallet list                    List stored wallets.
pyde-dev wallet show <name>             Print address (not secret).
pyde-dev wallet sign <name> <bytes>     Sign arbitrary bytes.
```

The two you'll use most are `pyde-dev build` and
`pyde-dev test`.

### `pyde-dev script`

The deployment runner. The format is
`<file>:<ContractName>`. The named contract is expected to
have a `pub fn run()` entry point:

```sh
pyde-dev script script/Deploy.oti:Deploy --network devnet
```

Flags:

- `--network <name>` — which network to deploy to (must be
  declared in `pyde.toml`).
- `--private-key <hex>` — explicit signing key (overrides
  wallet).
- `--wallet <name>` — name of a stored wallet to sign with.

### `pyde-dev test`

The test runner. Compiles `test/*.oti` and executes every
`#[test]` function inside an embedded PVM. The output reports
PASS/FAIL plus the gas consumed by each test.

```sh
pyde-dev test                          Run all tests.
pyde-dev test --filter increment       Only tests with "increment" in the name.
pyde-dev test -v                       Show call tree on failure.
pyde-dev test -vv                      Show storage state.
pyde-dev test -vvv                     Show full logs.
```

## `pyde.toml` schema

The project manifest. Lives at the root of the project.

```toml
[project]
name = "my_project"
version = "0.1.0"
description = "Optional one-line description"

[compiler]
optimize = true
src = "src"
test = "test"
out = "out"

[networks.devnet]
rpc = "http://127.0.0.1:8545"

[networks.testnet]
rpc = "https://testnet.pyde.network"

[networks.mainnet]
rpc = "https://rpc.pyde.network"
```

Sections:

- **`[project]`** — name, version, optional description.
- **`[compiler]`** — `optimize` (bool), `src`/`test`/`out`
  directory names.
- **`[networks.<name>]`** — one section per network. Each
  has an `rpc` URL. `pyde-dev script --network <name>`
  references these.
- **`[dependencies]`** — installed packages, populated by
  `pyde-dev install`. You usually don't edit this by hand.

## Project layout

```
project/
├── pyde.toml          Project manifest
├── src/               Contracts to deploy
│   ├── ContractA.oti
│   └── ContractB.oti
├── test/              Tests (#[test] functions in contract files)
│   ├── ContractA.test.oti
│   └── ContractB.test.oti
├── script/            Deployment + migration scripts
│   └── Deploy.oti
├── lib/               Installed packages
│   └── @std/          Standard library (always present)
├── out/               Build artifacts (.json files)
└── pyde.lock          Lockfile for dependencies
```

`pyde-dev init` scaffolds this entire layout.

## The standard library

`lib/@std/` is the standard library, copied into each new
project at `init` time. It provides:

- **`@std/math.oti`** — math utilities: `sqrt`, `abs`, modular
  arithmetic helpers.
- **`@std/token.oti`** — token primitives: ERC-20 interface,
  helper functions for common token interactions.
- **`@std/vm.oti`** — test cheatcodes (the `Vm` interface we've
  used throughout the book: `warp`, `roll`, `prank`,
  `makeAddr`, `deal`).

Import with `use std::vm;` (or `use std::math::{sqrt}`, etc.).

## Installing packages

```sh
pyde-dev install https://github.com/example/pyde-erc20.git
pyde-dev install https://github.com/example/pyde-multisig.git --rev v0.2.0
pyde-dev install         # Restore all from pyde.lock
```

Packages are cloned into `lib/<name>/` and recorded in
`pyde.toml` (in `[dependencies]`) and `pyde.lock`. Use the
lockfile-restore form (`pyde-dev install` with no args) to
re-create a project's dependency tree from a committed
lockfile.

## IDE setup

Otigen has Tree-sitter-based syntax-highlighting support. The
`tree-sitter-otigen` grammar lives at
`https://github.com/pyde-net/tree-sitter-otigen`. Hook it into
your editor:

- **Vim / Neovim**: install via `nvim-treesitter` and add
  `"otigen"` to the parsers list.
- **VS Code**: install the "Otigen" extension from the
  marketplace.
- **Emacs**: use `tree-sitter.el` with the otigen grammar.

A language server (LSP) is in development. Until it lands,
syntax highlighting + the inline error reporting from
`pyde-dev build` is the editor workflow.

## Continuous integration

A typical CI workflow for a contract project:

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Otigen
        run: |
          cargo install --git https://github.com/pyde-net/otic.git
          cargo install --git https://github.com/pyde-net/dev.git
      - name: Build
        run: pyde-dev build
      - name: Test
        run: pyde-dev test
      - name: Format check
        run: pyde-dev fmt --check
```

The `--check` flag on `pyde-dev fmt` returns non-zero if any
file isn't formatted — useful as a CI gate.

## Wallet storage

The `pyde-dev wallet` subcommands listed above operate on
locally-stored encrypted wallets. Wallets are encrypted with a
password the tool prompts for (Argon2 + AES-GCM); the
encrypted material lives at `~/.config/pyde-dev/wallets/`.

For CI / scripts, the `--private-key <hex>` flag on
`pyde-dev script` and `pyde-dev send` lets you pass a key
without using the wallet store. Use this only for *test*
keys; never for keys that hold real value.

## Summary

`otic` compiles `.oti` to `.json`. `pyde-dev` is the project
tool — scaffold, build, test, deploy, format, console.
`pyde.toml` is the manifest; `lib/@std/` is the standard
library; `out/*.json` is what you deploy. IDE support is
Tree-sitter-based today; LSP is in flight.

That's the entire toolchain. Most days you'll touch only
`pyde-dev build` and `pyde-dev test`.

---

This is also the end of the book. Thanks for reading; build
something.
