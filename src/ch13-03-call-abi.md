# The call ABI

The *call ABI* is the convention that lets a caller and a callee
agree on where arguments live, where the return value goes, and
how the runtime picks the right function for a given call. It's
what makes `IToken::at(addr).transfer(to, amount)` work: the
compiler emits a sequence that the receiving contract knows how
to interpret.

This section covers three pieces of the convention: argument
passing, the return value, and selector dispatch.

## Arguments arrive in registers

When a function is called, the runtime places each argument in a
register. The placement rule:

- The first GP-typed argument lands in `r2`.
- The second GP-typed argument lands in `r3`. And so on, through
  `r15` for the 14th GP argument.
- The first wide-typed argument lands in `w0`.
- The second wide-typed argument lands in `w1`. And so on,
  through `w6` for the 7th wide argument.

So a function with the signature:

```otigen
pub fn transfer(to: Address, amount: u256) {
    ...
}
```

receives `to` in `w0` (because `Address` is a 256-bit type) and
`amount` in `w1`. There are no GP arguments, so `r2` is unused.

A function with mixed types:

```otigen
pub fn batch_transfer(count: u64, recipients_ptr: u64, amount: u256) {
    ...
}
```

receives `count` in `r2`, `recipients_ptr` in `r3`, and `amount`
in `w0`.

The compiler handles the placement on both sides. From your
source, you just declare parameters and use them by name; the
compiler emits the bookkeeping.

## Returns come back in `r1` (or `w0`)

A function returns its value in a specific register:

- A GP-sized return value (`u64`, `bool`, etc.) goes in `r1`.
- A wide return value (`u256`, `Address`, struct that fits in
  256 bits) goes in `w0`.
- A larger return value (a struct that doesn't fit in 256 bits,
  a `String`, a `Vec<T>`) is *returned by reference*: the
  callee writes the value to a memory region the caller
  provided, and the caller reads it from there.

For functions that return a tuple, each element follows the same
rule. So `fn split() -> (u256, u256)` returns the first `u256`
in `w0` and the second in `w1`.

## Selector dispatch

When a transaction (or a cross-contract call) arrives at a
contract, the first four bytes of the calldata are a *function
selector*. The contract has a *dispatch table* — a small piece
of bytecode at the start of the runtime image — that compares
the incoming selector against each `pub fn`'s selector and
jumps to the matching function.

The selector itself is computed by FNV-1a hashing the function's
name:

```text
hash = 0x811c9dc5
for byte in name.bytes():
    hash ^= byte
    hash *= 0x01000193
selector = hash (as u32)
```

So `compute_selector("transfer")` gives a fixed four-byte value
that any caller and any contract that exports `transfer` will
agree on. The compiler emits the selector at build time; the
runtime reads it from the calldata at execution time.

A few special selectors:

- **`0x00000000`** — reserved for the constructor. The runtime
  uses this selector to dispatch to the `#[constructor]` during
  deployment. Regular `pub fn` selectors can never collide
  with this (the FNV-1a hash of any non-empty name is
  guaranteed non-zero).
- **No-selector calls** — a call with calldata length less than
  4 bytes is routed to the `#[receive]` function (if the
  contract has one) or reverts.
- **Unknown selectors** — a call whose selector doesn't match
  any `pub fn` is routed to the `#[fallback]` function (if the
  contract has one) or reverts.

We covered these dispatch corners in
[Chapter 8.5](ch08-05-receive-fallback.md).

## Calldata layout

The calldata of a call is laid out as:

```text
+----------+-----------+-----------+- ... -+-----------+
| selector | argument1 | argument2 |       | argumentN |
|  4 bytes |  encoded  |  encoded  |       |  encoded  |
+----------+-----------+-----------+- ... -+-----------+
```

The encoding rules for each argument:

- Fixed-size types (integers, `Address`, `bool`) are padded to
  32 bytes and laid out in declaration order. `u64` → 8
  significant bytes plus 24 zero bytes; `u256` → 32 bytes.
- Variable-size types (`String`, `bytes`, `Vec<T>`) carry a
  length prefix followed by the data, with offsets recorded in
  the head section. This matches the Ethereum ABI's
  fixed-and-dynamic encoding scheme.

The selector chooses *which* function runs; the rest of the
calldata is decoded against that function's signature.

## A dispatch trace

Imagine an external caller invokes
`IToken::at(addr).transfer(0xABCD..., 1_000)`. The flow:

1. The caller computes `selector = FNV-1a("transfer")` — say,
   `0xa9059cbb`. (The exact value depends on the name; this
   is illustrative.)
2. The caller ABI-encodes `(0xABCD..., 1_000)` as 32 bytes of
   `to` (padded address) and 32 bytes of `amount` (big-endian
   integer).
3. The caller submits a call with calldata = `selector ‖ to ‖
   amount` (68 bytes total).
4. The receiving contract's dispatch table compares
   `0xa9059cbb` against each `pub fn`'s selector. It matches
   `transfer`'s selector.
5. The dispatcher decodes the calldata against `transfer`'s
   parameter list: `to` (32 bytes) into `w0`, `amount` (32
   bytes) into `w1`.
6. The dispatcher emits a `Call` to the start of the `transfer`
   function. The function runs with `w0 = to`, `w1 = amount`.
7. When `transfer` exits, the runtime sees the receipt's
   final state and returns to the caller.

You never write the dispatch code by hand. The compiler emits
it as part of the runtime bytecode. The point of walking
through the trace is to make the layers visible: the call
chain is selector → dispatch → argument decoding → function
body → return.

## Cross-contract vs. top-level

The same calling convention works for:

- **Top-level calls** — a transaction from an EOA hits the
  dispatcher with `(selector, args)` as calldata. The
  dispatcher routes to a `pub fn`.
- **Cross-contract calls** — `Interface::at(addr).method(args)`
  emits the same shape, just with a different target. The
  receiving contract's dispatcher routes the same way.
- **Internal calls** — calls from one function in a contract to
  another *don't* go through the dispatcher. The compiler emits
  a direct `Call` to the function's address, with arguments
  pre-loaded into the right registers. There's no
  selector-encoded calldata for internal calls; it's a normal
  intra-contract jump.

This is why the dispatch table is small: it only enumerates
`pub fn`s. Internal helpers don't need an entry.

## Summary

The PVM call ABI: arguments arrive in `r2..r(1+N)` (GP) and
`w0..w(M-1)` (wide); returns come back in `r1` or `w0`; larger
returns use memory by reference. Calls from outside the contract
arrive as `(4-byte selector, ABI-encoded args)`; the dispatcher
matches the selector to a `pub fn` and decodes the arguments
into registers. The constructor selector is reserved at
`0x00000000`; bare value transfers route to `#[receive]`;
unknown selectors route to `#[fallback]`.

That's the end of the PVM chapter. The
[next chapter](ch14-00-abi.md) drills into the *ABI* — the
JSON schema that describes a contract's public surface, the
exact selector derivation rules, and the versioning
considerations once an ABI is deployed.
