<p align="center">
  <img src="./assets/logo.png" width="120" alt="Pyde logo" />
</p>

<h1 align="center">The Otigen Programming Language</h1>

<p align="center">
  <em>The smart-contract language for the Pyde blockchain</em>
</p>

---

A learning book for **Otigen**, the smart-contract language that targets the
[Pyde](https://github.com/pyde-net) blockchain.

This book teaches Otigen from the ground up. It assumes you already know what a
smart contract is — typically because you've written some Solidity — but it
does not assume you know Rust or any other systems language. Where Otigen
borrows from Rust, the book explains the borrowed concept on its own terms.

The book is written in [mdBook](https://rust-lang.github.io/mdBook/) format.
Source lives in `src/`; the rendered site is built into `book/`.

## Status

First-pass draft complete: front matter, 18 chapters across the language
fundamentals, runtime, and projects, plus six reference appendices. Roughly
65,000 words. Before publication, the book needs a verification sweep against
the live codebase and review/edit passes.

## Installing the Otigen toolchain

To follow along with the book, install the Otigen toolchain (`otic`,
`wright`):

```sh
curl -L https://install.pyde.network/otup | bash
otup
```

The first command installs `otup`, the toolchain manager. The second uses
`otup` to install `otic` and `wright`.

> Note: the installer infrastructure (`install.pyde.network/otup`) is part of
> the mainnet preparation work and may not yet be deployed. Until it ships,
> follow the source-build instructions in
> [Chapter 1.1](src/ch01-01-installation.md).

## Building this book locally

```sh
cargo install mdbook
mdbook serve --open
```

`mdbook serve` runs a local server at `127.0.0.1:3000` and watches `src/` for
changes — it live-reloads in the browser as you edit. The output is written to
`book/`, which is in `.gitignore` and never committed.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
