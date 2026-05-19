# The Otigen Programming Language

A learning book for **Otigen**, the smart-contract language that targets the
[Pyde](https://github.com/pyde-net) blockchain.

This book teaches Otigen from the ground up. It assumes you already know what a
smart contract is — typically because you've written some Solidity — but it
does not assume you know Rust or any other systems language. Where Otigen
borrows from Rust, the book explains the borrowed concept on its own terms.

The book is written in [mdBook](https://rust-lang.github.io/mdBook/) format.
Source lives in `src/`; the rendered site is built into `book/`.

## Status

Draft. Front matter, chapters 1–3, and the table of contents for the whole
book are written. Later chapters are stubs that will be filled in.

## Building locally

```sh
cargo install mdbook
mdbook serve --open
```

`mdbook serve` watches `src/` and live-reloads.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
