# Selectors

Every `pub fn` in a contract gets a 4-byte *selector* that
identifies it. The selector is the first four bytes of a call's
calldata, and the runtime's dispatch table uses it to route
incoming calls to the right function.

## How the selector is computed

Otigen derives selectors with **FNV-1a**, a non-cryptographic hash
function chosen for its simplicity and fast computation. The
algorithm:

```text
hash = 0x811c9dc5                  // FNV-1a 32-bit offset basis
for byte in function_name.bytes(): // UTF-8 bytes of the name
    hash ^= byte
    hash *= 0x01000193             // FNV-1a 32-bit prime
selector = hash (interpreted as u32)
```

The result is a 32-bit value — exactly four bytes. Otigen does
*not* truncate; the full 32-bit hash *is* the selector.

For "transfer", "approve", or any other name, the FNV-1a hash is
deterministic — different compilers, different machines, and
different Otigen versions all produce the same selector for the
same function name.

## Selector inputs

A few subtleties worth flagging:

**Only the function *name* is hashed.** Unlike Solidity, which
hashes the full signature (`transfer(address,uint256)`) and
takes the first four bytes of Keccak-256, Otigen hashes only
the name. This means two functions with the same name but
different parameter types would collide. The compiler enforces
*unique function names within a contract* to prevent this.

**Case matters.** `Transfer` and `transfer` produce different
selectors. The convention is `snake_case` for function names
(see [Chapter 3.3](ch03-03-functions.md)); deviations work but
break the convention.

**The full UTF-8 byte sequence is hashed.** This is rarely
relevant — almost all function names are ASCII — but if you
wrote a function with a non-ASCII name, the encoded UTF-8 bytes
go through the hash. Don't.

## Reserved selectors

Two values are special:

**`0x00000000` — the constructor.** The runtime dispatches the
deployment call (the call that runs the `#[constructor]`) to
selector `0x00000000`. Regular `pub fn`s cannot collide because
the FNV-1a hash of any non-empty name is guaranteed non-zero —
the algorithm starts from `0x811c9dc5` and only mixes with non-
zero XOR and multiplies, so the result for any non-empty input
is always non-zero.

This means you don't have to do anything to "reserve" the
constructor selector; the math reserves it for you.

**Empty calldata** (less than 4 bytes) is *not* a selector at
all. It routes to the `#[receive]` function if the contract
has one (or reverts otherwise) — we covered this in
[Chapter 8.5](ch08-05-receive-fallback.md). The dispatch
distinguishes "selector that doesn't match any function" (route
to fallback if present, else revert) from "no selector at all"
(route to receive if present, else revert).

## Selector collisions

A 32-bit hash has 2³² possible outputs. Two random function
names collide with probability roughly 1 in 2³² ≈ 1 in 4
billion. For a contract with 50 functions, the probability of
*any* collision (the "birthday problem") is roughly
50²/2³³ ≈ 1 in 3.4 million. Effectively zero.

The compiler enforces no-collisions *within a contract*: at
build time it computes every function's selector and refuses
to compile if two match. If you somehow manage to write two
function names whose FNV-1a hashes collide, the build fails
with a message naming both functions.

Across contracts, collisions are fine — the runtime knows
which contract is being called, and uses *that contract's*
dispatch table. A function called `transfer` in your token has
the same selector as a function called `transfer` in someone
else's token, but they live in different address spaces, so
the calls to each go to the right place.

## Why FNV-1a, not Keccak-256?

Solidity uses Keccak-256 (the first four bytes thereof) for
selectors. Otigen could have done the same. The choice of
FNV-1a is deliberate:

- **It's fast.** A 32-bit FNV-1a hash of a short string is a
  handful of instructions. Keccak-256 is much more expensive.
  Both are computed at *compile time* (the selector is baked
  into the bytecode), so the runtime cost is the same in both
  cases — but FNV-1a is easier to compute in places where a
  selector needs to be derived from a name at runtime (manual
  ABI encoding, debugging tools).
- **It's the right tool for the job.** Selectors don't need to
  be cryptographically secure. They need to be deterministic,
  fast, and collision-resistant *enough* that 50-function
  contracts can be expected to compile without colliding. A
  non-cryptographic hash is the right fit.
- **It matches Pyde's hash discipline.** Pyde uses Poseidon2
  for state-tree commitments (cryptographically required) and
  FNV-1a / Blake3 / Poseidon2 for other roles. FNV-1a as the
  selector hash fits naturally with the chain's broader
  hashing model.

The trade-off is that off-chain tools can't take a Keccak-256
of a Solidity-style signature and get an Otigen selector. They
have to use FNV-1a of the bare function name. Tooling that
generates SDKs handles this; it's only a manual concern if
you're encoding calldata by hand (with `raw_call!`, say).

## Where selectors appear

A selector appears in three places:

1. **In the bytecode.** The contract's dispatch table compares
   incoming selectors against compiled-in constants. You won't
   see them in your source, but they're there at execution
   time.
2. **In the calldata** of any cross-contract or external call.
   The first four bytes of every call.
3. **In the `.json` ABI metadata.** Each function's entry
   includes its computed selector as a 32-bit value — useful
   for tools that need the selector without recomputing it.

The deploy script and the build pipeline can both surface
selectors when needed:

```sh
$ wright abi out/Token.json | grep transfer
transfer: 0xa9059cbb
```

(The exact bytes depend on the FNV-1a output for `"transfer"`;
the example is illustrative.)

## Summary

Selectors are 4 bytes of FNV-1a hash over the bare function
name. The constructor uses the reserved `0x00000000`; all
other functions get their natural hash. Collisions inside one
contract are forbidden by the compiler; collisions across
contracts don't matter because the runtime routes calls by
target address. FNV-1a is the chosen hash for speed and
deterministic compile-time computation; it's not
cryptographically secure but doesn't need to be.

The [next section](ch14-02-json-schema.md) walks through the
JSON ABI itself — what each entry looks like in a `.json` file.
