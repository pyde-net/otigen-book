# Lazy allocation and zero values

A storage slot in Otigen costs gas to *write*. An unwritten slot
costs nothing — it's not allocated, it doesn't appear in the
state tree, and reading from it returns the *zero value* of the
slot's type. This is what "lazy allocation" means: storage is
allocated when you write to it, never before.

Two consequences fall out of this model, and both have surprised
people coming from other smart-contract languages, so we'll cover
them explicitly.

## Reading an unwritten slot returns its zero value

Every type has a designated zero value. Reading a slot that has
never been written returns it, no special case needed:

| Type             | Zero value                                 |
|------------------|--------------------------------------------|
| `u8`, …, `u256`  | `0`                                        |
| `i8`, …, `i256`  | `0`                                        |
| `bool`           | `false`                                    |
| `Address`        | `Address::ZERO` (the 32-byte all-zero)     |
| `String`         | `""` (empty string)                        |
| `bytes`          | `b""` (empty byte sequence)                |
| `[T; N]`         | `N` copies of T's zero value               |
| `Vec<T>`         | An empty vector (length 0)                 |
| `(T1, T2, …)`    | A tuple of each component's zero value     |
| `struct S { … }` | An S with every field set to its zero      |
| `enum E { A, B, …}` | The *first variant* (always A)          |

The full zero-value rule is "the type's zero is the value obtained
by setting every byte of its storage to `0x00`". For most types the
table above is the consequence; for `enum`, the discriminant `0`
identifies the first variant, which is why we said in
[Chapter 2](ch02-00-counter-project.md) that the default value of a
`Mode` field is `Mode::Open` (the first variant we declared).

## Map entries inherit the rule

Reading an unset map entry is the case where lazy allocation
matters most. Consider:

```otigen
let alice_balance = self.balances[alice];
```

If `alice` has never been credited a balance, this read returns
`0` *without* allocating a slot for Alice. The runtime computed the
hash for `(contract_address, balances_slot_index, alice)`, looked it
up in the state tree, found nothing, and returned the `u256` zero.
No gas is paid for "creating" Alice's entry; gas is paid only when
we actually write a balance.

This is why the erc20 `transfer` can simply do:

```otigen
self.balances[to] = self.balances[to] + amount;
```

even when `to` has never held a balance. The read yields `0`, the
addition computes `0 + amount`, and the write commits — paying the
SSTORE cost exactly once, exactly when we wanted to.

## Writing a non-zero value to a fresh slot

When you write a non-zero value into a slot that previously held
zero (or that was never allocated), the runtime allocates the slot
and records it in the state tree. This is the most expensive write:
the *fresh-slot SSTORE*. The exact gas cost is in
[Appendix C](appendix-c-builtins.md); the order of magnitude is "a
few thousand gas".

```otigen
self.balances[fresh_user] = 1_000;  // fresh-slot SSTORE
```

## Writing zero to a non-zero slot

The reverse case is *deallocation*. When you write zero to a slot
that previously held a non-zero value, the runtime de-allocates the
slot — it's removed from the state tree, and the contract receives
a *gas refund* for the freed storage.

```otigen
self.balances[some_user] = 0;  // refund-on-zero
```

The refund is partial — somewhere around half the cost of the
original allocation — but it's real. Contracts that follow a
clean-up-after-use pattern (closing a position, completing a
transfer, finalising a vote) can claim significant refunds in
practice.

## Writing the same value back

Writing a value that's identical to what's already there is the
cheapest of the three: the runtime detects the no-op and skips the
storage write entirely. You still pay for the comparison and the
SLOAD that fetched the current value, but you don't pay the
mutation cost.

This makes idempotent setters cheap. A function that calls
`self.config = new_config` repeatedly with the same `new_config`
pays only the read cost on the second and later calls.

## Implications for storage design

A few patterns fall out of these rules.

**Don't pre-populate maps.** Some contract authors, coming from
arrays-of-fixed-size, instinctively pre-write zero to every entry
of a map "just in case". Don't. The runtime already knows the entry
is zero by virtue of it not existing; pre-writing zeros pays the
SSTORE cost for nothing.

**Clear when you're done.** If you're tracking transient state —
the pending-orders list of a DEX, the confirmation flags of a
multisig — explicitly clearing fields back to zero once a
transaction has settled is good citizenship. Your contract pays a
slightly higher cost on the path that does the cleanup, and a much
lower one over the contract's lifetime. The refund offsets a
chunk of the original cost.

**Boolean flags are storage too.** A `bool` is its own slot
(remember, no packing). A contract with seventeen `bool` fields
spends seventeen SSTOREs at construction if you write all of them
to `true` in the constructor. Often a `u32` bitfield is the right
encoding when many booleans really do belong together.

## Summary

Storage in Otigen is *lazy*: a slot doesn't exist until you write
to it, reading an unwritten slot returns the type's zero value,
and clearing a slot back to zero deallocates it and refunds gas.
The model means you can read freely without pre-allocating, write
sparingly to control cost, and rely on the runtime to keep the
state tree as small as your contract has actually populated it.

That's the end of the storage chapter. Next we'll cover the
*shape* of the data we store: [structs, enums, and pattern
matching](ch05-00-structs-enums.md).
