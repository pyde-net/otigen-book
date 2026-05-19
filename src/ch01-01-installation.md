# Installation

The first step is to install Otigen. You'll need two binaries:

* **`otic`** — the Otigen compiler. It turns `.oti` source files into PVM
  bytecode and an ABI.
* **`pyde-dev`** — Otigen's project tool. It scaffolds new projects, runs
  the compiler over a whole `src/` tree, runs your tests inside an
  embedded virtual machine, and deploys finished contracts to a network.

Both are written in Rust and installed with `cargo`, Rust's package
manager. If you don't already have Rust installed, follow the official
instructions at <https://www.rust-lang.org/tools/install>. You'll need a
stable Rust toolchain (1.70 or newer).

## Installing `otic` and `pyde-dev`

> Note: at the time of writing, Otigen has not yet been published to a
> public package registry. You install from source by cloning the
> Pyde polyrepo. Once a stable registry release exists, these
> instructions will be replaced by a single `cargo install otic
> pyde-dev` command.

Clone the repositories and install:

```sh
$ git clone https://github.com/pyde-net/otic.git
$ git clone https://github.com/pyde-net/dev.git
$ git clone https://github.com/pyde-net/engine.git

$ cargo install --path otic
$ cargo install --path dev
```

The two `cargo install` commands compile and copy the binaries into
`~/.cargo/bin`, which Rust's installer puts on your `$PATH`.

## Checking the installation

Verify that everything is in place:

```sh
$ otic --version
otic 0.1.0

$ pyde-dev --version
pyde-dev 0.1.0
```

If you see version numbers, you're ready to go. If you see `command not
found`, double-check that `~/.cargo/bin` is on your `$PATH`. On macOS and
Linux, you can add it temporarily:

```sh
$ export PATH="$HOME/.cargo/bin:$PATH"
```

To make it permanent, add that line to your shell's startup file
(`~/.bashrc`, `~/.zshrc`, or equivalent).

## Updating and uninstalling

Because the installation is source-based, updating means re-running
`cargo install --path` after pulling the latest commits in each repo:

```sh
$ cd otic && git pull && cargo install --path . --force
$ cd ../dev && git pull && cargo install --path . --force
```

To uninstall:

```sh
$ cargo uninstall otic
$ cargo uninstall pyde-dev
```

Now that you have the tools, let's write a small program.
