# Gas cost

Checked arithmetic costs gas. Every `a + b` does more work than
the equivalent unchecked operation in a language with optional
checks. For most contracts the cost is too small to matter; for
gas-tight inner loops, it can be a measurable fraction of the
function's budget. This section quantifies what you're paying.

## The per-operation cost

The exact gas numbers are versioned (the PVM gas schedule can be
updated by a fork). The current schedule, for arithmetic on
common widths, looks roughly like this:

| Operation              | u64    | u256   |
|------------------------|--------|--------|
| `+`, `-`               | 3      | 6      |
| `*`                    | 5      | 12     |
| `/`, `%`               | 8      | 25     |
| `==`, `<`, `>`         | 3      | 5      |
| `&`, `|`, `^`, `~`     | 3      | 5      |
| `<<`, `>>`             | 3      | 5      |
| Cast (widen)           | 1      | 1      |
| Cast (narrow, checked) | 3      | 6      |

The actual cost is whatever the chain's current gas schedule
specifies; the table is illustrative. For up-to-the-block
values, consult the PVM gas table (see
[Appendix C](appendix-c-builtins.md)).

A few patterns the table reveals:

- **`u256` is ~2× the cost of `u64`** for most ops. This is the
  most consequential gas decision for most contracts: prefer
  `u64` for small counters and indices; use `u256` only when
  values genuinely require it (token balances, hashes,
  addresses-as-numbers).
- **Multiplication and division are pricier than addition.**
  Multiplications inside loops (computing
  per-element-weighted-sums, for example) accumulate.
- **Checked narrow casts cost extra.** Each narrow cast does an
  overflow check; widening casts are free (a `u8 as u256` is a
  no-op).

## What the check adds

The check itself accounts for roughly **30%** of an arithmetic
op's gas cost. A `u256 + u256` would be ~4 gas without the
overflow check; with the check it's ~6. The numbers are small
absolutely; relatively, the check is a noticeable fraction.

If your function does 100 `u256` arithmetic operations, you're
paying 200 extra gas for the checks. Within the cost of a single
SSTORE (~5,000 gas), this is rounding error. For an inner-loop
hash function doing 10,000 operations, it's 20,000 gas — a
fifth of the gas budget for some applications.

## When arithmetic dominates

The contracts where arithmetic costs add up are:

- **Cryptographic primitives.** Hash functions, MAC computations,
  signature verifications. These are inner loops of bit-shifts
  and modular arithmetic; thousands of operations per call.
- **Curve calculations.** AMMs that use a constant-product
  curve, options pricing, oracles that aggregate many feeds.
  The math here is `u256`-heavy.
- **Batched operations.** A function that processes 100
  transfers does 100 balance reads + 100 balance writes + 200
  arithmetic ops. The arithmetic isn't free.

For most other contracts — token transfers, governance votes,
multisigs — the arithmetic is a tiny fraction of the gas budget
relative to the storage and event costs.

## Comparison with Solidity 0.8+

Solidity 0.8 introduced checked arithmetic by default, with the
`unchecked { … }` block as an opt-out. The behaviour is
equivalent to Otigen's defaults; the difference is the escape
hatch.

In Solidity, `unchecked { a += 1; }` runs without an overflow
check, saving a few gas. Some Solidity codebases use this
heavily — inside trusted loops where the author has proven
overflow can't occur. Otigen makes the same choice
unavailable, which means a few common patterns cost slightly
more in Otigen than in Solidity:

- **Indexed `for` loops.** Solidity's `for (uint256 i = 0; i <
  n; ++i)` can put `++i` inside `unchecked { }` once `i < n` is
  established. Otigen's `for i in 0..n` is checked on each
  iteration — but the range form already proves `i < n`, so the
  compiler optimises the check away in many cases.
- **Reentrancy-guard counters.** The auto-guard's increment uses
  bitwise operations (set the lock to 1, clear to 0) — no
  arithmetic involved.
- **Token mints.** A `total_supply += amount; balances[to] +=
  amount;` does two checked adds. In Solidity 0.8 with
  `unchecked`, an author who's already required `amount <=
  MAX` can skip both. In Otigen, you pay the checks.

The gas difference per call: typically 100–500 gas, occasionally
more in tight loops.

## Mitigations

If you're optimising a tight loop, three patterns help:

**Use the narrowest type that fits.** A loop that genuinely
operates on `u64`s costs half as much as the same loop on
`u256`s. Promote to `u256` only at the points where the wider
range matters.

**Hoist invariants out of the loop.** A check that's
load-invariant inside a loop — `require!(total < MAX)` — can be
moved outside the loop. The runtime still does the body's
per-operation checks, but the loop-condition check pays once.

**Use bitwise where possible.** When the arithmetic is
genuinely modular (a hash mix, a checksum), use `<<` / `>>` /
`&` / `^` instead of `+` / `-`. Bitwise operations don't
overflow and don't carry the check cost.

## The trade-off

The cost is real. The benefit is also real: every smart-contract
exploit history is littered with arithmetic overflow bugs —
balanceOf-overflows that mint infinite tokens, multiplication-
overflows that bypass slippage checks, division-by-zero that
divides someone's stake to negative. The aggregate dollar value
lost to these bugs runs into the *billions*.

The few hundred gas per call that Otigen spends on checked
arithmetic is the language paying that insurance premium for
you. For most contracts the trade-off is overwhelmingly worth
it. For the cases where it isn't — gas-tight cryptographic
inner loops — the bitwise workarounds give you the wrap-on-
purpose behaviour without losing the check on the rest of the
function.

## Summary

Checked arithmetic costs roughly 30% more per operation than
unchecked. The cost is in the noise for most contracts (a few
hundred gas per call) but accumulates in inner loops of
arithmetic-heavy code. Prefer `u64` over `u256` when values
fit, hoist invariants out of loops, and use bitwise operators
when wrapping is genuinely intended. The cost is the insurance
premium against an entire bug class; for almost every contract,
the premium is cheap.

That's the end of Part III on functions and safety. The
[next chapter](ch12-00-project-token.md) is the first of the
project chapters: we build a full fungible token from scratch
using the concepts of Chapters 1–11.
