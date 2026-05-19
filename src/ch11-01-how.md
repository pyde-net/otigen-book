# How it works

For every arithmetic operation, the compiler emits a check.
After the operation, if the result is outside the type's
representable range, the runtime reverts the transaction with a
specific error.

This section walks through what the checks actually look like
and what the revert payload contains.

## The five checked operations

The arithmetic operators that get an overflow check:

| Operator | Check                                          |
|----------|------------------------------------------------|
| `+`      | result fits the destination type               |
| `-`      | result fits the destination type (no underflow)|
| `*`      | result fits the destination type               |
| `/`      | divisor is non-zero                            |
| `%`      | divisor is non-zero                            |

Comparison operators (`==`, `!=`, `<`, `>`, `<=`, `>=`) don't
need overflow checks — their result is always a `bool`, which
can't overflow. Bitwise operators (`&`, `|`, `^`, `~`, `<<`,
`>>`) don't overflow either, except for shift counts that
exceed the type width (which trap with their own error).

## What the check actually does

Conceptually, every `a + b` where `a` and `b` are `uN` becomes:

```text
let (result, overflow) = checked_add_uN(a, b);
require!(!overflow, ArithmeticOverflow {});
// use `result`
```

The PVM has a single instruction per checked operator
(`AddU64`, `MulU256`, etc.) that returns the result *and* a
single-bit overflow indicator. The runtime branches on the
indicator and either continues with the result or reverts.

For signed types, the check is the corresponding signed-range
predicate: `i64 + i64` overflows if the result is outside
[-2⁶³, 2⁶³−1].

For division and modulus, the only check is *divisor ≠ 0*. The
result of a checked division never overflows the destination
type (unsigned division yields a value ≤ the dividend; signed
division has one edge case — `i64::MIN / -1` — which Otigen also
treats as an overflow and reverts).

## What gets emitted on overflow

When a check fires, the runtime reverts with a system error:

- **`ArithmeticOverflow`** — for additions, subtractions, and
  multiplications that overshoot the destination type's range.
- **`DivisionByZero`** — for `/` or `%` with a zero divisor.

Both are *system errors*: they're declared by the compiler,
not in your source, and they have no fields. The revert payload
is just the four-byte selector for the corresponding error.

Off-chain tooling sees the selector, decodes it as
`ArithmeticOverflow` or `DivisionByZero`, and displays a
human-readable message. There's no recoverable data — the only
information is "this operation failed".

## Reverts are unrecoverable inside the same contract

When an arithmetic operation reverts, the transaction unwinds
to the most recent recoverable boundary. For a function called
directly by a transaction (the top-level call), the entire
transaction reverts. For a function called via `raw_call!`, the
*sub-call* reverts and the caller can decide whether to handle
it; but the cross-contract boundary is the only way to catch an
overflow.

This is intentional. The behaviour of a contract is supposed to
be predictable: if you add two `u64`s and the result is too
big, the contract's state should not advance with a wrong value
silently. The choice the language makes is: better to
fail-loud than to fail-silent.

## Mixing widths: an example

A frequent source of overflow surprises is mixing integer
widths. Otigen requires explicit casts between widths, so this
shows up as a compile error rather than a silent overflow:

```otigen
let small: u8 = 200;
let big:   u16 = 50_000;

let bad = small + big;  // <-- compile error
```

```sh
error: cannot add `u8` and `u16` directly
  --> src/Bad.oti:4:15
   |
 4 |     let bad = small + big;
   |               ^^^^^^^^^^^ widths differ; cast one operand
   |
   = help: try `(small as u16) + big`
```

You explicitly choose which type the operation happens in.
Widening (`small as u16`) is safe — every `u8` value fits in
`u16`. Narrowing (`big as u8`) is *checked* — if `big` doesn't
fit, the cast traps with `ArithmeticOverflow`.

## Constant folding

The compiler folds arithmetic over compile-time constants
*ahead of time*, and applies the same overflow check at that
time. So this:

```otigen
let x: u8 = 200 + 100;  // <-- compile error
```

fails to compile, because `300` doesn't fit in `u8`. The
compiler doesn't wait until runtime to catch the obvious
overflow; it catches it during build. The runtime check is for
operations involving runtime-known values.

## What's *not* checked

A few things might surprise you.

**Cast traps are not arithmetic overflows.** Casting `u256` to
`u8` traps with `ArithmeticOverflow` if the value doesn't fit,
but the trap fires in the *cast*, not in any addition. You
won't see the overflow until you write the cast.

**Boolean operations don't have overflow concepts.** `true &&
false`, `!x`, comparisons — none of these need checks.

**String concatenation isn't arithmetic.** If you concatenate
two `String`s, the result's length grows in the obvious way;
the operation is allocation, not arithmetic. (Otigen's
`String` doesn't currently support a `+` operator; you use a
helper from `std::string`.)

## Summary

Otigen checks every arithmetic operation for overflow,
underflow, and division by zero. The check is per-operation,
emitted by the compiler, and reverts the transaction on
failure with a system error (`ArithmeticOverflow` or
`DivisionByZero`). Constant-time overflows are caught at compile
time; runtime overflows revert the transaction unwindably. There
is no `unchecked` escape hatch.

The [next section](ch11-02-wrapping.md) covers the cases where
modular arithmetic is what you actually want, and the idioms for
writing it explicitly.
