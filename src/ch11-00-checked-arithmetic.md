# Checked Arithmetic

Every arithmetic operation in Otigen is *checked*. Add two `u64`s
that overflow the type, and the transaction reverts before any
subsequent state change is committed. Multiply a `u256` by a
factor that overshoots its range, and the transaction reverts.
Divide by zero, and the transaction reverts.

There is no `unchecked { … }` escape hatch and no per-operator
opt-out. If you want wrapping arithmetic — for a hash mix, for a
deliberately modular counter — you write it explicitly with bitwise
operators, as we'll see in the second section of this chapter.

The choice is one of Otigen's harder-edged design decisions. It
costs gas. It costs a small amount of verbosity in the rare case
where wrapping is genuinely intended. The benefit is the *removal
of an entire bug class*. The chapter has three sections:

- [How it works](ch11-01-how.md) — the mechanism, the revert
  payload, what the runtime actually does on overflow.
- [When wrapping is wanted](ch11-02-wrapping.md) — the idioms for
  genuine modular arithmetic in a language without `unchecked`.
- [Gas cost](ch11-03-gas-cost.md) — what the checks cost
  per-operation, when arithmetic dominates a function's gas
  budget, and how Otigen compares with Solidity 0.8+.
