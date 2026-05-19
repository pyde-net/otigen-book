# When wrapping is wanted

Most arithmetic in a smart contract is *not* modular. Token
balances should not wrap around. Block heights should not wrap
around. Counter values should not wrap around. Wrapping is the
sound of a contract going wrong.

But occasionally — for hashing, for bitfield manipulation, for
sequence numbers that genuinely cycle — wrapping is the correct
semantics. This section is about how to write modular arithmetic
when you mean it, in a language without an `unchecked` escape
hatch.

## Hash mixing

A hash-combine routine mixes intermediate values; overflow is
the *point*. The arithmetic happens in the bitwise domain:

```otigen
fn mix(a: u256, b: u256) -> u256 {
    let mut h = a;
    h = h ^ b;
    h = (h << 13) | (h >> 243);   // rotate-left-by-13
    h = h ^ (h >> 7);
    return h;
}
```

There's no `+`, `-`, or `*` here. The combine uses XOR, shift,
and rotation only — all of which are total, well-defined, and
wraparound-correct by definition (no overflow possible). If you
need an additive mix, do it inside an explicit modulus:

```otigen
fn additive_mix(a: u64, b: u64) -> u64 {
    // Modular addition, manually:
    return (((a as u128) + (b as u128)) & 0xFFFFFFFFFFFFFFFF) as u64;
}
```

Here we widen to `u128` (where the addition can't overflow),
sum, mask to the desired width, and narrow back. The cast `as
u64` traps if the masked value somehow exceeds `u64::MAX` (it
can't — the mask guarantees it — but the runtime checks anyway).

## Bitfield manipulation

Packing many small fields into a single `u256` (a status word,
a feature-flags register, a packed counter) is a routine
practice. The operations on a bitfield are bitwise, not
arithmetic, and they don't trip the overflow checks:

```otigen
fn set_bit(field: u256, bit: u8) -> u256 {
    return field | ((1u256) << (bit as u8));
}

fn clear_bit(field: u256, bit: u8) -> u256 {
    return field & ~((1u256) << (bit as u8));
}

fn get_bit(field: u256, bit: u8) -> bool {
    return (field >> (bit as u8)) & 1u256 == 1u256;
}
```

Notice the `as u8` on the shift count: shifts are checked too,
and `<<` by a count that exceeds the type's width traps. The
compiler insists on the cast so you've thought about it.

## Sequence numbers that wrap

A *short* sequence number that wraps deliberately — say, a 16-bit
counter for an off-chain protocol that tolerates re-use after a
billion increments — is sometimes acceptable. Express the wrap
explicitly with a modulus:

```otigen
storage {
    seq: u16,
}

pub fn increment_seq() {
    // Modular increment: 0xFFFF + 1 → 0
    self.seq = ((self.seq as u32) + 1) % 65536u32) as u16;
}
```

The widen-add-mod-narrow pattern: do the arithmetic in a wider
type (no overflow), apply the modulus you want, narrow back. The
narrow-back can't overflow because the modulus already capped the
value.

This is *more verbose* than the equivalent Solidity
`unchecked { seq += 1; }` for a reason: the verbosity is exactly
what you want when the wrap is intentional. A reviewer reading
your code sees the modulus and knows wrapping is meant. They
don't have to ask "is the author aware this can overflow?"

## Random-number folding

Mixing a 256-bit random value down to a 64-bit modulus uses
modular reduction:

```otigen
fn random_below(rand: u256, n: u64) -> u64 {
    // Take rand mod n, then narrow.
    return (rand % (n as u256)) as u64;
}
```

The modulus reduces the range; the narrow cast can't fail (the
modulus guarantees the result fits). Note the cast on `n`: the
modulus operator requires both operands to be the same width.

## What you *can't* do

A few patterns from other languages that simply don't translate:

**`unchecked { ... }` blocks.** Otigen has none. Every arithmetic
operation is checked. If you write `a + b`, you accept the
overflow check.

**Saturation arithmetic (`a.saturating_add(b)`).** No built-in.
You can write a helper:

```otigen
fn saturating_add_u64(a: u64, b: u64) -> u64 {
    let sum_wide = (a as u128) + (b as u128);
    if sum_wide > (u64_max() as u128) {
        return u64_max();
    }
    return sum_wide as u64;
}

fn u64_max() -> u64 {
    return 18_446_744_073_709_551_615u64;
}
```

There's no `u64::MAX` constant in the language; if you need it,
write the literal or derive it (`(1u128 << 64) - 1`).

**Wrapping by attribute (`#[wrap] fn foo()`).** No such
attribute exists. The "I want wrapping" choice is per-operation,
not per-function.

## When the verbose form is too verbose

If you find yourself writing the same widen-add-narrow dance many
times — say, in a hash function or a cryptographic primitive —
factor it into a helper. The helper itself contains the verbose
form once; the call sites read clean:

```otigen
fn wrap_add_u64(a: u64, b: u64) -> u64 {
    return (((a as u128) + (b as u128)) & 0xFFFFFFFFFFFFFFFFu128) as u64;
}

// At call site:
let h = wrap_add_u64(h, mix_constant);
```

You pay the verbosity once; the rest of the code reads as
intended.

## Summary

Otigen has no `unchecked` block. When you want modular
arithmetic, you write it explicitly: bitwise operators for hash
mixing, widen-narrow patterns for modular addition or
subtraction, helper functions for the patterns you use often.
The verbosity is intentional — wrapping should be visible in the
source, not hidden behind a flag.

The [next section](ch11-03-gas-cost.md) covers what all this
checking costs you in gas.
