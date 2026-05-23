<p align="center">
  <img src="./assets/logo.png" width="120" alt="Pyde logo" />
</p>

<h1 align="center">The Otigen Programming Language</h1>

<p align="center">
  <em>Historical reference. Otigen is no longer Pyde's execution model.</em>
</p>

---

This is the long-form book for **Otigen**, a smart-contract language
Pyde designed and built during an earlier phase of the project. Pyde
has since pivoted its execution layer to **WebAssembly via wasmtime**;
contracts on the current chain are authored in Rust, AssemblyScript,
Go (TinyGo), or C/C++. The Otigen-the-language compiler (`otic`), the
Otigen-specific developer tool (`wright`), and the custom virtual
machine + AOT compiler (`pyde-vm` / `pyde-aot`) are all retired.

**The book is preserved as a historical artifact** — not deleted, not
hidden — because the design space is documented thoroughly and the
lessons live on in Pyde's current toolchain. The first chapter you'll
see on the rendered site, [A Note Before You Read This Book](src/pivot-notice.md),
sets the framing in full.

If you arrived here looking for **current Pyde development**, read
[the Pyde Book](https://book.pyde.network) — start with
[the pivot story](https://book.pyde.network/preface/pivot) for
context, then the architecture chapters for the WebAssembly execution
model and the current `otigen` developer toolchain.

---

## What's in the book

18 chapters across language fundamentals, runtime, and projects, plus
six reference appendices. ~65,000 words. Frozen at the moment the WASM
pivot landed; will not be updated.

The Otigen *name* lives on in Pyde's current developer toolchain — a
binary that scaffolds projects, generates state bindings, builds WASM
artifacts in the author's chosen language, and handles the deploy
lifecycle. The *language* described in this book does not.

---

## Reading it

Online: <https://otigen-book.pyde.network> (deployed via AWS Amplify).

Locally:

```sh
cargo install mdbook
mdbook serve --open
```

`mdbook serve` runs a local server at `127.0.0.1:3000` and watches
`src/` for changes — it live-reloads as you edit. The output writes to
`book/`, which is gitignored and never committed.

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).
