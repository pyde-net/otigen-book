# Introduction

## What Otigen is

Otigen is a domain-specific language for writing smart contracts that
execute on the [Pyde](https://github.com/pyde-net) blockchain. Source files
use the `.oti` extension. The compiler is called `otic`. Its output is a
JSON artifact (a `.json` file) that contains PVM bytecode, an ABI, and
metadata — deployable directly via the `pyde-dev` toolchain or by any
client that speaks Pyde's JSON-RPC.

Otigen is **not** a general-purpose language. It compiles to the Pyde
Virtual Machine (PVM), a register-based instruction set built specifically
for verifiable execution under consensus. The language exists so that
contracts targeting Pyde can be written safely, audited cheaply, and
executed in parallel by the runtime — without the developer having to think
about parallelism, encoding, or the post-quantum cryptography underneath.

## What Otigen is not

It is not Solidity, and it does not try to be. The shapes are similar
enough that an experienced EVM developer can read an Otigen contract
without a tutorial, but the semantics differ in places that matter. The
table below previews the most consequential differences; later chapters
explain each.

| Concern | Solidity | Otigen |
|---|---|---|
| Reentrancy guard | Off by default; opt in via OpenZeppelin or modifier | **On by default**; opt out with `#[reentrant]` |
| Integer overflow | Checked since 0.8; `unchecked { … }` opts out | Checked, always; no `unchecked` escape hatch |
| `tx.origin` | Available | **Does not exist** (phishing-prevention) |
| Storage layout | Slot-based; collisions possible across structs | Typed `storage { … }` block; compiler assigns slots |
| View purity | Honor-system at the language level | Statically enforced, transitively |
| Block author | `block.coinbase` / `block.miner` | `block.anchor` (DAG anchor address) |
| Selectors | First 4 bytes of `keccak256(signature)` | First 4 bytes of `FNV-1a(function name)` |
| Hashing primitive | `keccak256` everywhere | `Poseidon2` everywhere |
| MEV protection | None at the language level | Threshold-encrypted transactions; ordering is decided before decryption |
| Parallelism | None at the language level | Compile-time access lists; the runtime parallelises independent transactions |

## Why these choices

Four principles shaped the language. Calling them out up front, because
they appear over and over in the chapters that follow:

1. **Safety by default, not by discipline.** A contract author should not
   need to remember to apply a reentrancy guard, check arithmetic, or
   verify the caller is not a malicious proxy. Where a default behaviour
   is "the safe one", Otigen picks that one — and makes the unsafe form
   visible (a `#[reentrant]` attribute, an explicit `as` cast).

2. **The compiler tells the runtime everything it can.** The chain runs
   faster when it knows in advance which storage slots a function will
   touch. Otigen's typed storage block makes those slots statically
   inferable in the common case, and the scheduler reads the inferred
   access list to run independent transactions concurrently. The
   programmer writes `self.balances[to] += amount` and the parallelism
   happens for free.

3. **Errors as values, not as strings.** Solidity's `require(cond, "msg")`
   is fine for humans but useless for indexers, off-chain monitors, and
   composed contracts. Otigen errors are typed structs — `error
   InsufficientBalance { available: u256, required: u256 }` — and revert
   data carries the typed payload. The same `require!` macro accepts
   either a string or a struct; you'll see the struct form everywhere a
   caller might want to inspect the failure.

4. **Make the unsafe form ugly.** Inline assembly, integer wraparound,
   reentrancy permission, `unsafe`-style escape hatches — Otigen makes
   each of these either impossible or syntactically loud. You will not
   accidentally cast a `u256` down to a `u8`; you will not accidentally
   call back into your contract during an external transfer. If you do,
   the call site is annotated.

## Who this book is for

EVM developers. If you've written a Solidity contract — even a small one —
you have enough background to follow every chapter. We don't assume you
know Rust; where Otigen borrows Rust syntax (pattern matching, the `let`
keyword, ownership-style move semantics for ABI calldata), the book
explains the borrowed idea on its own terms.

The book assumes you understand: gas, storage slots, ABIs, function
selectors, events/logs, and what reentrancy is. It does *not* assume you
understand: the Pyde consensus protocol, the PVM instruction set, or the
threshold-encryption pipeline. Those show up later, and they're explained
when they do.

## How the book is organised

There are three kinds of chapters:

**Concept chapters** introduce one part of the language at a time — types,
functions, errors, events, the storage block. They lean on small,
self-contained code snippets and explain *why* the language behaves the
way it does, not just *how*.

**Safety + runtime chapters** explain how Otigen contracts meet the
underlying chain. These cover reentrancy, access control, cross-contract
calls, the access-list inference, threshold-encrypted ordering, the ABI
format, and the compilation pipeline. If you skip them you will still be
able to write contracts, but you will be guessing about why a few defaults
exist.

**Project chapters** build something end-to-end. There are three of them,
and they get progressively harder:

- **Chapter 12 — a fungible token.** Demonstrates storage, events,
  errors, and the constructor.
- **Chapter 17 — a multisig wallet.** Adds access control, signature
  validation, and encoded action payloads.
- **Chapter 22 — a mini-DEX with encrypted swaps.** Composability,
  arithmetic precision, and Pyde's threshold-encryption primitive in
  one place.

The appendices are reference material: keywords, operator precedence,
built-in functions, common compiler errors, a side-by-side Solidity →
Otigen cheat sheet, and the tooling guide.

## A note on the state of the book

Pyde itself is pre-mainnet. The language and compiler are stable in their
shape; the chain itself is being rebuilt against a post-pivot consensus.
Where a chapter relies on something that has not yet shipped (an RPC, a
deployed standard library, a parachain primitive), it says so
explicitly. The book is written for the language as it will exist at
mainnet, and is being battle-tested against real contracts before launch.

Let's get to it.
