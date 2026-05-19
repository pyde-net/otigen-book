# Defining structs

A `struct` groups named fields into a single value. It's how you
model "a thing with these properties": a transaction with a
target and a value, a position with a holder and a size, a proposal
with a description and a deadline.

## Declaring a struct

The syntax is `struct Name { field: Type, ... }`:

<span class="filename">Filename: src/Vault.oti</span>

```otigen
contract Vault {
    struct Deposit {
        owner: Address,
        amount: u256,
        deposited_at: u64,
        is_locked: bool,
    }

    storage {
        deposits: Map<u64, Deposit>,
        next_id: u64,
    }
}
```

A struct can be declared at the top level of a file (where it's
visible to any contract in the file) or inside a contract (where
it's scoped to that contract). Top-level structs are useful when
the same shape needs to flow through several contracts; contract-
scoped structs keep the type adjacent to where it's used.

Each field has a name and a type. Types follow the rules from
[Chapter 3](ch03-02-data-types.md) and
[Chapter 4](ch04-01-the-storage-block.md): primitives, addresses,
`String`, `bytes`, fixed arrays, `Vec<T>`, other structs, enums.
You cannot put a `Map<K, V>` inside a struct — maps are only
allowed at the top level of `storage`.

## Constructing struct values

Create a struct value by writing the name followed by braces with
each field set:

```otigen
let d = Deposit {
    owner: msg.sender,
    amount: msg.value,
    deposited_at: block.timestamp,
    is_locked: false,
};
```

The field order in the constructor doesn't need to match the
declaration order; fields are matched by name. Every field must be
specified — there's no "default values" mechanism for a struct
literal. (If you want defaults, write a helper function that
returns a fully-populated struct.)

## Storing a struct in storage

You can store a struct directly:

```otigen
contract Vault {
    storage {
        latest: Deposit,
    }

    #[payable]
    pub fn record() {
        self.latest = Deposit {
            owner: msg.sender,
            amount: msg.value,
            deposited_at: block.timestamp,
            is_locked: false,
        };
    }
}
```

Writing the whole struct in one statement is the idiomatic form.
Internally the compiler emits a write for each field, but the
source reads cleanly as "store this whole record".

You can also write individual fields:

```otigen
self.latest.amount = self.latest.amount + msg.value;
self.latest.is_locked = true;
```

The dot-access composes with reads, writes, and compound-assignment
forms the same way.

## Storing a struct inside a map

Maps can hold structs as values:

```otigen
storage {
    deposits: Map<u64, Deposit>,
}

pub fn create_deposit() {
    let id = self.next_id;
    self.next_id = self.next_id + 1;
    self.deposits[id] = Deposit {
        owner: msg.sender,
        amount: msg.value,
        deposited_at: block.timestamp,
        is_locked: false,
    };
}

#[view]
pub fn deposit_owner(id: u64) -> Address {
    return self.deposits[id].owner;
}
```

Reading a single field through the map (`self.deposits[id].owner`)
is more efficient than reading the whole struct and discarding
fields. The compiler emits a load for only the field you accessed.

If `id` has never been written, `self.deposits[id]` returns a struct
with every field set to its zero value — `Address::ZERO`, `0`,
`false`. We covered the [zero-value rule](ch04-04-lazy-allocation.md)
in the previous chapter; it applies recursively into structs.

## Passing structs to functions

A struct can be a function parameter or return type. Like all
non-Map types, structs pass by value (the function gets its own
copy):

```otigen
fn within_grace_period(d: Deposit) -> bool {
    return block.timestamp - d.deposited_at < 86_400;
}

pub fn extend_lock(id: u64) {
    let d = self.deposits[id];
    require!(within_grace_period(d), TooLate {});
    self.deposits[id].is_locked = true;
}
```

The function `within_grace_period` receives a copy of `d`. Reading
fields from that copy is free; modifying them would only modify the
copy, not the storage entry. If you need to mutate the persisted
record, do it through `self.deposits[id].field = ...` directly.

## Using structs in events and errors

Both `event` declarations and `error` declarations are themselves
struct-shaped:

```otigen
event DepositRecorded {
    #[indexed]
    owner: Address,
    id: u64,
    amount: u256,
}

error VaultLocked { id: u64, locked_at: u64 }
```

The difference between `event`, `error`, and a plain `struct` is
where the value ends up, not what it looks like:

- A *struct value* lives wherever you put it (a local, a storage
  slot, a function argument).
- An *event value* gets emitted to the transaction receipt by
  `emit EventName { … }`.
- An *error value* gets carried in revert data by `require!` /
  `revert!`.

This is why constructing all three uses the same `Name { field:
value, ... }` literal syntax. It's the same shape; only the
destination differs.

## Composition: a struct of structs

Structs nest:

```otigen
struct Position {
    holder: Address,
    size: u256,
}

struct Round {
    settler: Address,
    positions: Vec<Position>,
    settled_at: u64,
}
```

Reading nested fields chains through the access:

```otigen
let first_holder = self.current_round.positions[0].holder;
```

There's no special syntax for nesting; the access just composes. If
you ever find yourself writing
`self.x.y.z.w.holder`, it's worth asking whether the data wants to
be lifted into its own storage field with a simpler access path.

## ABI representation

When a `pub fn` takes a struct as a parameter or returns one, the
struct appears in the contract's ABI as a tuple of its fields, in
declaration order. So a Solidity caller (or any other client
encoding against the JSON ABI) would write the equivalent of
`(Address, u256, u64, bool)` to pass a `Deposit`. Names are
preserved in the ABI for documentation but the wire encoding is
positional.

This matters when you change a struct's field *order* — even
without removing or adding fields. Reordering changes the ABI
encoding. We'll cover that in
[Chapter 14](ch14-03-versioning.md); for now: don't reorder a
struct's fields after you've published its ABI.

## Summary

A `struct` groups named fields of different types into one value.
Declare with `struct Name { field: Type, … }`. Construct with
`Name { field: value, … }`. Use them as locals, storage fields,
map values, function parameters, return types, event payloads,
and error payloads — they shape data in all of those places.

The [next section](ch05-02-enums.md) introduces the partner type
to the struct: the *enum*.
