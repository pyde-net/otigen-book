# Installation

The first step is to install the Otigen toolchain. You'll end up with
two binaries:

* **`otic`** — the Otigen compiler. Turns `.oti` source files into PVM
  bytecode and an ABI.
* **`wright`** — Otigen's project tool. Scaffolds new projects, runs
  the compiler over a whole `src/` tree, executes tests inside an
  embedded virtual machine, and deploys finished contracts to a
  network.

You can install both with one command.

## The recommended way: `otup`

The Otigen toolchain manager is **`otup`**. It plays the same role for
Otigen that `rustup` plays for Rust and `foundryup` plays for Foundry:
one binary that installs, updates, and version-pins the rest of the
toolchain.

Install `otup` with a single curl:

```sh
$ curl -L https://install.pyde.network/otup | bash
```

The command downloads a small bootstrap script, runs it locally, and
ends with `otup` on your `$PATH`. Then run:

```sh
$ otup
```

which installs the latest stable `otic` and `wright`. After that,
keeping the toolchain up to date is a single command:

```sh
$ otup update
```

> **Status (pre-mainnet).** The `install.pyde.network/otup` endpoint
> and the binary-release pipeline that backs it are part of the
> mainnet preparation work. At the time you're reading this, they may
> not be deployed yet — in which case the curl above will fail, and
> you should fall back to the build-from-source instructions below.
> When the installer ships, this section becomes the canonical path
> and the source-build form moves to an appendix.

`install.pyde.network/` is the umbrella URL for every Pyde toolchain
installer; future paths will serve different audiences (a path for
the validator node, a path for the wallet, etc.). The `/otup` path is
specifically for the smart-contract toolchain.

## Installing from source

If the `otup` installer isn't available yet, or you'd rather build from
the latest commits, the source-build path works today.

You'll need a stable Rust toolchain (1.70 or newer). If you don't have
one, follow the instructions at
<https://www.rust-lang.org/tools/install>.

Then clone the relevant repositories and install:

```sh
$ git clone https://github.com/pyde-net/otic.git
$ git clone https://github.com/pyde-net/dev.git
$ git clone https://github.com/pyde-net/engine.git

$ cargo install --path otic
$ cargo install --path dev
```

The two `cargo install` commands compile and copy the binaries into
`~/.cargo/bin`, which Rust's installer puts on your `$PATH`.

To update, pull the latest commits and re-install with `--force`:

```sh
$ cd otic && git pull && cargo install --path . --force
$ cd ../dev && git pull && cargo install --path . --force
```

To uninstall:

```sh
$ cargo uninstall otic
$ cargo uninstall wright
```

## Checking the installation

Whichever path you used, verify the result:

```sh
$ otic --version
otic 0.1.0

$ wright --version
wright 0.1.0
```

Two version numbers means you're set. If you see `command not found`,
the binaries aren't on your `$PATH`. For `otup`-installed binaries,
the directory is `~/.pyde/bin`; for source-built ones, `~/.cargo/bin`.
On macOS and Linux, add the appropriate directory:

```sh
$ export PATH="$HOME/.pyde/bin:$HOME/.cargo/bin:$PATH"
```

Add that line to your shell's startup file (`~/.bashrc`, `~/.zshrc`,
or equivalent) to make it permanent.

Now that you have the tools, let's write a small program.
