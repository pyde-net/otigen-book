# Slot layout

The Otigen compiler assigns each storage field a *slot number*, and
the runtime stores the field's value at the location derived from
that slot. Most of the time you can ignore the slot layout
entirely — `self.balance` works whether the field is at slot 0 or
slot 47. But knowing how the layout is computed helps when you're
auditing storage costs, writing an upgradeable contract, or
explaining a state-root mismatch.

## The rules in one paragraph

The compiler walks the `storage { … }` block top to bottom and
assigns each field the next available *slot index*, starting at 0.
For a plain field (an integer, an address, a struct), the value
lives at the storage location derived from `(contract_address,
slot_index)`. For a `Map<K, V>` field, every entry's location is
derived from `(contract_address, slot_index, key)`. The derivation
function is a Poseidon2 hash, so two distinct `(slot_index, key)`
pairs cannot collide.

That's the whole story. The rest of this section is the corollaries.

## One slot per field

Take the erc20 storage block from earlier:

```otigen
storage {
    name: String,            // slot 0
    symbol: String,          // slot 1
    decimals: u8,            // slot 2
    total_supply: u256,      // slot 3
    balances: Map<Address, u256>,                 // slot 4
    allowances: Map<Address, Map<Address, u256>>, // slot 5
}
```

Each field gets one slot, no matter the type. A `u8` does not pack
into a `u256` next to it — every field is its own slot. The
trade-off Otigen makes here is *clarity over density*: knowing that
"every field is a slot" makes the access-list analysis (which
[Chapter 15](ch15-00-access-lists.md) covers) precise. The price is
slightly higher raw storage cost for small fields, which is
negligible at the prices smart contracts actually pay.

This is one place where Otigen deliberately differs from Solidity.
A Solidity struct that holds a `uint8` and a `uint16` packs both
into the same 32-byte slot; Otigen would give each a slot of its
own.

## Map entries are *virtual* slots

For a map, no storage is allocated at declaration. The map "lives
at" slot index `N`, but slot `N` itself is never written. What
*does* exist is a derived slot for every key the contract has
actually written:

```
storage_slot(map, key) = Poseidon2(contract_address || slot_index_of_map || key)
```

So `self.balances[alice]` and `self.balances[bob]` map to two
different storage locations. Both are derived from the same
`slot_index_of_map` (slot 4 in our erc20), but the addresses of
Alice and Bob differ, so the hashes differ.

For nested maps the derivation chains:

```
storage_slot(allowances, owner, spender)
  = Poseidon2(
      contract_address ||
      slot_index_of_allowances ||
      Poseidon2(owner) ||
      spender
    )
```

The exact key-encoding is not something you'll write by hand;
you'll access the entry with `self.allowances[owner][spender]` and
let the compiler emit the right `Sload` / `Sstore`. But knowing
that *two-level* nesting hashes through two layers is useful for
estimating gas: each layer of map nesting costs one extra hash.

## Why fields cannot collide

Because the slot index is a compile-time constant and the
hash domain separates the field slot from the map keys, no two
different storage accesses can resolve to the same physical
location:

- Two plain fields can't collide — they have different slot indices.
- Two map entries within the same map can't collide — they have the
  same slot index but distinct keys, and the hash is collision-
  resistant.
- A plain field and a map entry can't collide — the encoding
  domains differ, and the compiler refuses to emit a plain-field
  access against a slot it knows is a map (and vice versa).

This is one of the safety properties that comes for free from
typing storage: you never have to think about "is my slot
overlapping with some library's slot?", because the question
doesn't have a yes-answer.

## Why two contracts cannot collide

The hash domain includes the *contract's own address*. Two
contracts deployed at different addresses get different storage
location hashes even for the same `slot_index + key` pair. A
storage write made by contract `A` cannot affect a storage read
made by contract `B`, because the addresses prefix the hash input.

You will sometimes see the address-prefix expressed in writing as
"every contract has its own storage namespace". That's accurate;
it's just implemented via the hash, not via a literal namespace
tree.

## Implications for upgradeable contracts

If you are writing a contract that you plan to upgrade *in place*
(via a proxy), the slot layout becomes part of the contract's ABI.
A new version of the contract that reorders, inserts, or removes
storage fields will give those fields different slot indices —
which means the old data is "lost" (still in storage at the old
slots, but invisible to the new code).

Two practical rules if you're writing an upgradeable contract:

1. **Append new fields at the end** of the storage block, never in
   the middle.
2. **Never delete or reorder** existing fields. Replace a
   field-no-longer-used with a same-typed `_deprecated_X` field if
   you must rename it, so the slot index stays put.

If you are writing a one-shot non-upgradeable contract (a token, a
multisig, a vault), none of this matters. Reorder freely.

## A note on slot index visibility

The slot indices the compiler assigns *are* emitted into the
metadata section of the `.pyc` artifact. If you peek at
`out/MyContract.pyc` you'll see something like:

```json
"metadata": {
  "storage_layout": [
    { "name": "name",        "slot": 0, "type": "String" },
    { "name": "symbol",      "slot": 1, "type": "String" },
    { "name": "decimals",    "slot": 2, "type": "u8" },
    { "name": "total_supply","slot": 3, "type": "u256" },
    { "name": "balances",    "slot": 4, "type": "Map<Address, u256>" },
    { "name": "allowances",  "slot": 5, "type": "Map<Address, Map<Address, u256>>" }
  ]
}
```

This is what indexers and storage-viewers use to render a
contract's state for human inspection.

## Summary

Each storage field gets a sequential slot index starting at 0. For
plain fields the slot index identifies the storage location
directly; for map entries the location is hashed from
`(contract_address, slot_index, key)`. Two fields can't collide,
two contracts can't collide, and the layout is recorded in the
`.pyc` metadata for downstream tools. Reorder fields freely in a
one-shot contract; never reorder in an upgradeable one.

The [next section](ch04-04-lazy-allocation.md) covers what happens
when you *don't* write a slot — i.e. the zero-value rules that
make storage in Otigen cheap.
