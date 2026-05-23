# A Note Before You Read This Book

This book describes **Otigen**, a programming language that was designed for the Pyde blockchain during an earlier phase of the project. It documents the language's syntax, semantics, standard library, virtual machine, and developer toolchain as they existed when this book was written.

**The language described in this book is no longer Pyde's execution model.**

After honest evaluation of the maturity of the WebAssembly ecosystem, its sandbox properties, its ZK-readiness trajectory, and the performance parity demonstrated by direct measurement, Pyde pivoted its execution layer to WebAssembly (via wasmtime). Authors can now write Pyde smart contracts in Rust, AssemblyScript, Go, or C/C++ — whatever language they already know. The custom virtual machine (`pyde-vm`), the ahead-of-time compiler (`pyde-aot`), and the Otigen-specific compiler (`otic`) have all been retired.

The Otigen *name* lives on. Pyde's new developer toolchain is called `otigen` — a binary that scaffolds projects, generates state bindings, builds WASM artifacts in the author's chosen language, and handles the deploy lifecycle. The name carries forward as homage to the ergonomic ambitions of the language; the role the name occupies has shifted from "the language you write your contract in" to "the tool that builds your contract." Same posture as Rust's `cargo` (named for shipping containers, not a programming concept) or Foundry's `forge`/`cast`/`anvil` (craft-naming for tools).

The full story of the pivot — what motivated it, what was retained, what was retired, and what was learned — lives in the Pyde Book at `pyde-book/src/preface/pivot.md`.

## Why this book is still here

This book is preserved as a historical artifact. It is not deleted, nor archived behind a closed door, for three reasons:

1. **The work is real.** Designing this language, building its compiler, writing its standard library, and dogfooding contracts taught us what mattered in a smart-contract execution environment. Reentrancy guards, checked arithmetic, typed storage, compile-time access-list inference, no `tx.origin`, attribute-driven function semantics — these lessons live in how Pyde's WebAssembly host functions and developer toolchain are now designed. The language is retired; the lessons are not.

2. **Honesty serves the project.** Pretending the language never existed would be dishonest about Pyde's actual trajectory. The pivots are part of the story. A reader who lands here from a Google search for "Otigen language" deserves to find out what happened, not a 404.

3. **It may be useful to language designers.** Otigen was a designed-from-scratch DSL for verifiable on-chain execution. Its design space — the choices it made and didn't make — is documented thoroughly in the chapters that follow. Someone designing a similar language elsewhere may find the trade-offs worth reading about.

## How to read what follows

If you arrived here looking for **current Pyde development**, you should read the Pyde Book instead. Start with `pyde-book/src/preface/pivot.md` for context, then the architecture chapters for the WebAssembly execution model and the new `otigen` developer toolchain.

If you arrived here interested in **how Otigen was designed**, the rest of this book is the canonical reference, frozen at the moment the pivot landed. The toolchain chapters reference `wright` (the developer CLI of that era) — `wright` is also archived, and its role is now served by the new `otigen` binary. The VM chapter describes `pyde-vm` and the AOT compiler `pyde-aot` — both retired. The threshold-encryption and ABI chapters describe protocol-level concepts that survive the pivot intact (just expressed as WebAssembly host functions now, not as language built-ins).

Read accordingly.
