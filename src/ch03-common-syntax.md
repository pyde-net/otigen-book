# Common syntax

This chapter is the line-of-code-level walkthrough. We cover the syntax
that appears inside every function body — bindings, literals, operators,
control flow — and then a few constructs that are slightly off-script
from Solidity: pattern matching, block expressions, tuple destructuring.

If you are an EVM developer skimming, this is the chapter to read most
carefully. The contract-level shape ([Chapter 2](ch02-shape-of-a-contract.md))
will feel familiar; the inside of a function will feel like Rust. The
borrowed bits from Rust are explained on their own terms; you do not
need to know Rust.

## 3.1 Let bindings and mutability

A local variable is introduced with `let`:

```otigen
let from_bal = self.balances[msg.sender];
let allowance = self.allowances[from][msg.sender];
```

Otigen *infers* the type of `from_bal` and `allowance` from the right-hand
side. Maps of `u256` values yield `u256`, so both bindings are `u256`.

If you want to be explicit (for readability, or to force a wider type),
write the type annotation:

```otigen
let from_bal: u256 = self.balances[msg.sender];
let small_count: u8 = 0;
```

By default a binding is **immutable**: you cannot re-assign to it.

```otigen
let x = 1;
x = 2;        // compile error: cannot assign to immutable binding `x`
```

Add `mut` to allow reassignment:

```otigen
let mut x = 1;
x = 2;        // fine
x = x + 10;   // fine
```

This is the only `mut` you will see at the binding level. Storage fields
(`self.x`) are always mutable from inside mutating functions; you cannot
mark a storage field "const" inside the `storage { ... }` block (use a
top-level `const` for that).

You can also destructure tuples in a `let`:

```otigen
let (lo, hi) = some_tuple_value;
let (success, return_data) = raw_call!(target, calldata, gas, value);
```

## 3.2 Numeric literals and integer types

Integer literals can be written in decimal or hex, with underscores as
visual separators:

```otigen
let supply  = 1_000_000_000;       // decimal
let mask    = 0xFF_FF_FF_FF;       // hex
let big     = 1_000_000u256;       // explicit type suffix
let tiny    = 0u8;                 // explicit type suffix
```

If you don't write a suffix, the literal's type is inferred from
context. In a context that demands `u256` (a storage write to a
`u256` field, for example), `1_000_000` is a `u256`. In a context
that demands `u8`, it's a `u8`. If the literal does not fit the
inferred type, you get a compile error — `300u8` will not compile.

The integer types Otigen knows about are:

| Width | Unsigned | Signed |
|---|---|---|
| 8-bit  | `u8`   | `i8`   |
| 16-bit | `u16`  | `i16`  |
| 32-bit | `u32`  | `i32`  |
| 64-bit | `u64`  | `i64`  |
| 128-bit| `u128` | `i128` |
| 256-bit| `u256` | `i256` |

`u256` and `i256` are the natural width for token balances, hashes,
and addresses-treated-as-numbers. You can do arithmetic on any of these,
and arithmetic between two `uN` (or two `iN`) of the same width is
type-correct without casts. Mixing widths — `u64 + u256` — requires an
explicit `as` cast on one side.

### Checked arithmetic

All Otigen arithmetic is **checked**. If `a: u256 = u256::MAX` and you
evaluate `a + 1`, the transaction reverts with an arithmetic-overflow
error before any subsequent state change is committed. There is *no*
`unchecked { … }` block.

If you need wrapping arithmetic (a fixed-width hash mix, a counter that
intentionally wraps), do it in bitwise space: `(a + b) & mask`, or
treat the operand as a byte sequence.

## 3.3 Booleans, addresses, strings, bytes

```otigen
let ok: bool   = true;
let zero: Address = Address::ZERO;
let me: Address   = msg.sender;
let label: String = "hello";
let data: bytes   = msg.data;
```

`bool` is `true` or `false` — no implicit conversion from integers,
ever. `if 1 { ... }` does not compile. The condition must be `bool`.

`Address` is a 32-byte identifier. Two pseudo-fields exist:
`Address::ZERO` (the all-zeros sentinel) and `Address::from(u256)`
(reinterpret a 256-bit value as an address). You can compare addresses
with `==` and `!=`, store them in `Map<Address, _>`, and put them in
events.

`String` is a UTF-8 byte sequence; literals use double quotes. Escapes
that exist: `\n`, `\t`, `\r`, `\\`, `\"`, `\0`, `\xHH` (single hex byte).

`bytes` is a raw byte sequence. You'll see it most commonly as the
return type of `raw_call!` and the parameter of `cross_call!`.

## 3.4 Operators

### Arithmetic

```otigen
a + b   a - b   a * b   a / b   a % b
```

All checked. Division by zero reverts. Modulus by zero reverts.

Compound assignment exists:

```otigen
self.count += 1;
balance     -= amount;
```

`+=` is sugar for "evaluate `self.count + 1` and store back into
`self.count`"; if the RHS overflows, the store doesn't happen.

### Comparison

```otigen
a == b   a != b   a < b   a > b   a <= b   a >= b
```

Returns `bool`. Both sides must be the same type — comparing a `u8` to a
`u64` requires an `as` cast. Addresses compare by byte equality.

### Logical (short-circuit)

```otigen
a && b   a || b   !a
```

`&&` evaluates its left side first; if `false`, the right side is not
evaluated. `||` is the mirror. This matters when the right side has side
effects — `require!(allowance >= amount && update_allowance(...))` will
not call `update_allowance` if the allowance check fails.

### Bitwise

```otigen
a & b   a | b   a ^ b   ~a   a << b   a >> b
```

Bitwise on integer types only. `<<` and `>>` shift by a count that must
be a `u8`-fitting value. Out-of-range shifts (shifting a `u64` by 65)
revert.

### Operator precedence

From highest to lowest:

```text
field access / call / index    .  []  ()
unary                          - ! ~ try
multiplicative                 *  /  %
additive                       +  -
shift                          <<  >>
bitwise AND                    &
bitwise XOR                    ^
bitwise OR                     |
comparison                     ==  !=  <  >  <=  >=
logical AND                    &&
logical OR                     ||
assignment                     =  +=  -=  *=  /=  %=  &=  |=  ^=  <<=  >>=
```

When in doubt, parenthesise. The compiler agrees with the precedence
table above; the human reading your diff in six months may not. The
full precedence table is in [Appendix B](appendix-b-operators.md).

## 3.5 Casts: the `as` keyword

Cross-width integer conversion is done with `as`:

```otigen
let small: u8  = (some_u64 as u8);
let big:   u256 = (some_u32 as u256);
let signed: i64 = (some_u64 as i64);
```

Two rules apply:

- **Widening** (smaller → larger) always succeeds: `(x as u256)` from a
  `u64` is a no-op semantically.
- **Narrowing** (larger → smaller) succeeds *only if the value fits*. If
  `x: u256` holds `1_000_000` and you write `(x as u8)`, the transaction
  reverts with an overflow error at the cast point.

There is no implicit conversion. If the compiler can't figure out which
type you wanted, you'll get an "ambiguous type" error and a cast will
fix it.

## 3.6 Control flow

### `if`

```otigen
if amount > 0 {
    self.balances[to] += amount;
}

if a > b {
    return a;
} else {
    return b;
}
```

`if` is also an *expression*: it returns a value if both branches do.

```otigen
let label = if balance == 0 { "empty" } else { "non-empty" };
```

When you use `if` as an expression, both branches must return the same
type, and neither branch can fall off the end (no implicit `()`).

### `while`

```otigen
while self.queue_length() > 0 {
    self.process_next();
}
```

Plain old condition loop. The condition is evaluated before each
iteration; the body must be a block.

### `for`

Two forms:

```otigen
// Range form — exclusive upper bound
for i in 0..10 {
    self.values[i] = 0;
}

// Iterating a Vec
for tx in self.pending_txs {
    self.execute(tx);
}
```

Range form: `start..end` iterates from `start` (inclusive) up to `end`
(exclusive). Both bounds must be integer expressions of the same type.

Iterating a `Vec<T>` yields `T` values one at a time, in insertion order.

You **cannot** iterate a `Map`: a `Map<K, V>` does not know its keys.
If you need iterable keyed storage, track keys in a parallel `Vec<K>`.

### `break` and `continue`

Standard meanings:

```otigen
for i in 0..n {
    if self.skip(i) { continue; }
    if self.done(i) { break; }
    self.process(i);
}
```

### `match`

`match` is pattern-based dispatch on a single value. It's the natural
fit for `enum`-typed state machines.

```otigen
enum AuctionState { Open, Closing, Closed }

match self.state {
    AuctionState::Open    => self.handle_open(),
    AuctionState::Closing => self.handle_closing(),
    AuctionState::Closed  => revert!("auction already closed"),
}
```

A match must be **exhaustive**: every variant of the enum must be
covered. If you add a new variant later and forget to update the match,
the compiler refuses to compile until you do. The wildcard pattern `_`
matches anything not previously matched:

```otigen
match status {
    Status::Active => self.do_active(),
    _              => self.do_default(),
}
```

`match` is also an expression — each arm produces a value, and they must
all be the same type.

## 3.7 Tuples

A tuple is a fixed-length sequence of values, where each position can
have a different type. They're used most often for returning multiple
values from a function.

```otigen
let pair: (u64, u64) = (100, 200);
let (lo, hi) = pair;

pub fn split(amount: u256) -> (u256, u256) {
    let half = amount / 2;
    return (half, amount - half);
}

let (a, b) = split(1000);
```

Tuples are *values*, not references. Passing a tuple to a function
copies it. There is no tuple sub-indexing syntax (no `pair.0`) — to
extract elements, destructure with a `let`.

## 3.8 Block expressions

A `{ ... }` block is itself an expression. The last expression in the
block (without a trailing `;`) is the value of the block.

```otigen
let max = {
    let a = compute_a();
    let b = compute_b();
    if a > b { a } else { b }
};
```

This is mostly useful for keeping a small computation visually grouped
with the binding it produces. You will not need it often; when you do,
it is exactly the syntax you'd reach for.

## 3.9 Comments

```otigen
// line comment

/* block comment
   spans multiple lines */

/* even /* nested */ block comments */

/// doc comment — captured by the compiler and emitted in metadata.
/// Use these for public functions you want documented in the ABI.
pub fn balance_of(owner: Address) -> u256 { ... }
```

`///` doc comments are picked up by `otic doc` and end up in the
contract's metadata next to the function. Use them for `pub fn`
documentation that should ship to consumers; use `//` for internal
notes.

## 3.10 Things that look like Solidity but are not

A few syntactic gotchas EVM developers stumble into. Worth calling out:

### Function parameters

```otigen
// Otigen
pub fn transfer(to: Address, amount: u256) { ... }

// Solidity for comparison
function transfer(address to, uint256 amount) public { ... }
```

Otigen puts the **name first, type after, separated by a colon**. The
order matters less than you'd think after a day of writing it.

### No semicolons after `}`

```otigen
if a > b {
    return a;
}   // no semicolon here
```

Block-ending constructs (`if`, `while`, `for`, `match`, function
declarations) don't take a trailing semicolon. Expression statements do.

### Return values

```otigen
pub fn double(x: u64) -> u64 {
    return x * 2;
}
```

You must write `return` explicitly. Otigen does not (yet) support
"last expression is the return value" the way Rust does inside function
bodies. The omission is intentional: an explicit `return` makes it
unambiguous that a function does not silently fall through.

### No `++` and `--`

```otigen
let mut i = 0;
i = i + 1;     // fine
i += 1;        // also fine
i++;           // compile error: unknown token
```

There is no postfix increment. Use `+= 1`.

### Storage assignment costs gas

```otigen
self.count = 5;     // SSTORE — costs gas, refundable on net-zero churn
```

This is identical to Solidity semantics, but worth restating because it
is the dominant gas cost in most contracts. Reading is cheaper than
writing; writing a slot back to zero refunds part of the original cost.
See [Chapter 14](ch14-checked-arithmetic.md) for the full gas table.

## 3.11 What we covered

Bindings (`let`, `let mut`), the integer-type ladder, every operator
family, the four control-flow constructs (`if`, `while`, `for`, `match`),
tuples, block expressions, comments, and the small-but-real points
where Otigen syntactically diverges from Solidity.

The chapters that follow zoom in on each of the type categories in
turn — [primitives](ch04-primitive-types.md),
[composites](ch05-composite-types.md), and the
[typed storage block](ch06-maps-and-storage.md) — before we move on to
functions in detail.
