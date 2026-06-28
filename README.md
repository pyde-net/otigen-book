<p align="center">
  <img src="./assets/logo.png" width="120" alt="Pyde logo" />
</p>

<h1 align="center">The Otigen Programming Language</h1>

<p align="center">
  <em>Historical reference. The Otigen <strong>language</strong> documented here is retired — the name <code>otigen</code> was recycled for Pyde's current developer toolchain.</em>
</p>

---

This is the book for a language Pyde **shipped, used, and retired.**
**Otigen** was a Rust-flavored smart-contract language designed
specifically for Pyde's execution layer — complete with its own
compiler (`otic`), virtual machine (`pyde-vm` / `pyde-aot`), and
developer tool (`wright`). When Pyde pivoted its execution layer to
**WebAssembly via wasmtime**, the language, the compiler, the VM, and
the tool were all retired in a single deliberate cut. Contracts on the
current chain are authored in Rust, AssemblyScript, Go (TinyGo), or
C/C++ and run on the new toolchain that inherited the name `otigen` —
a clean break that kept nothing but the brand.

**The book is preserved as a historical artifact** — not deleted, not
hidden — because the design space is documented end-to-end and the
lessons it surfaces shaped what came after. Sixty-five thousand words,
eighteen chapters, six appendices, all frozen at the moment of the
pivot. A complete map of a path Pyde took and chose to leave. If you
care about how chains and languages co-design, why Pyde reached for
its own syntax and then walked back, or what gets kept when a project
changes direction — start with [A Note Before You Read This Book](src/pivot-notice.md),
which sets the framing in full, and keep going.

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

The Otigen _name_ lives on in Pyde's current developer toolchain — a
binary that scaffolds projects, generates state bindings, builds WASM
artifacts in the author's chosen language, and handles the deploy
lifecycle. The _language_ described in this book does not.

---

## Reading the book

Browse the chapters directly on GitHub. Each one is a standalone
markdown file under `src/` that renders inline, and the cross-chapter
links inside them follow correctly within the repository.

Start here:

- **[A Note Before You Read This Book](src/pivot-notice.md)** — framing for why this book is preserved as a historical artifact
- **[Foreword](src/foreword.md)**
- **[Introduction](src/introduction.md)**
- **[Table of contents](src/SUMMARY.md)** — full chapter and appendix list

Or jump straight in:

- [Chapter 1 — Getting Started](src/ch01-00-getting-started.md)
- [Chapter 2 — Programming a Counter](src/ch02-00-counter-project.md)
- [Chapter 3 — Common Programming Concepts](src/ch03-00-common-concepts.md)
- [Chapter 4 — Storage and Maps](src/ch04-00-storage-and-maps.md)
- [Chapter 5 — Structs, Enums, and Pattern Matching](src/ch05-00-structs-enums.md)
- [Chapter 6 — Errors and Reverts](src/ch06-00-errors.md)
- [Chapter 7 — Events and Logs](src/ch07-00-events.md)
- [Chapter 8 — Function Attributes](src/ch08-00-attributes.md)
- [Chapter 9 — Reentrancy](src/ch09-00-reentrancy.md)
- [Chapter 10 — Cross-Contract Calls](src/ch10-00-cross-contract.md)
- [Chapter 11 — Checked Arithmetic](src/ch11-00-checked-arithmetic.md)
- [Chapter 12 — Project: ERC-20-Style Token](src/ch12-00-project-token.md)
- [Chapter 13 — The Pyde Virtual Machine](src/ch13-00-pvm.md)
- [Chapter 14 — The ABI](src/ch14-00-abi.md)
- [Chapter 15 — Access Lists](src/ch15-00-access-lists.md)
- [Chapter 16 — Threshold Encryption](src/ch16-00-threshold-encryption.md)
- [Chapter 17 — Project: Multisig Wallet](src/ch17-00-project-multisig.md)
- [Chapter 18 — Project: A Minimal DEX](src/ch18-00-project-dex.md)

Appendices:

- [A — Keywords](src/appendix-a-keywords.md)
- [B — Operators](src/appendix-b-operators.md)
- [C — Built-ins](src/appendix-c-builtins.md)
- [D — Errors](src/appendix-d-errors.md)
- [E — Solidity Cheatsheet](src/appendix-e-solidity-cheatsheet.md)
- [F — Tooling](src/appendix-f-tooling.md)

### Or build it locally

If you want the rendered mdBook experience (sidebar navigation, search, theme toggle):

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
