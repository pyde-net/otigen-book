# Maps and nested maps

You'll spend more time with `Map<K, V>` than with any other Otigen
storage type. Every token contract is a `Map<Address, u256>` of
balances; every multisig has a `Map<u256, Transaction>` of pending
operations; every governance contract has a `Map<u256, Map<Address,
bool>>` of votes-per-proposal-per-voter. Maps are how contracts
remember who-did-what.

## Declaring a map

A map's type is written `Map<KeyType, ValueType>`:

<span class="filename">Filename: src/Registry.oti</span>

```otigen
contract Registry {
    storage {
        // address -> registered display name
        names: Map<Address, String>,
        // numeric id -> address that claimed it
        owners: Map<u64, Address>,
        // address -> whether they're on the allow-list
        allow: Map<Address, bool>,
    }
}
```

The key types you'll see in practice are:

- `Address` — by far the most common
- `u64`, `u256` — for id-keyed records, slot indices, timestamps
- `String` — for name-keyed lookups (e.g. ENS-style registries)
- `u8` — small enumerations, role bitmaps

The value type can be *anything*: a primitive, a struct, an enum, a
`Vec<T>`, even another `Map`. The only restriction is that whatever
you pick must already be a type you've defined.

## Reading and writing

Map access uses square-bracket indexing — *exactly* like array
indexing, syntactically:

```otigen
contract Registry {
    storage {
        names: Map<Address, String>,
    }

    pub fn set_name(name: String) {
        self.names[msg.sender] = name;
    }

    #[view]
    pub fn name_of(owner: Address) -> String {
        return self.names[owner];
    }
}
```

`self.names[msg.sender] = name` writes; `self.names[owner]` reads.
The bracket form composes with assignment to write, and is an
expression when used in a value position to read.

You can also use compound assignment on maps:

```otigen
self.balances[msg.sender] = self.balances[msg.sender] - amount;
self.balances[recipient]  = self.balances[recipient]  + amount;
```

The explicit form is the idiom you'll see most often in production
fixtures (every transfer in the erc20 contract is written this
way). The shorter `self.balances[msg.sender] -= amount` is also
accepted by the parser; they desugar to the same code.

## Nested maps

A map's value type can be a map. The natural way to write "address
→ address → balance" is:

```otigen
storage {
    allowances: Map<Address, Map<Address, u256>>,
}
```

Access nested maps with chained indexing — exactly as you'd write
in math notation:

```otigen
let current = self.allowances[owner][spender];
self.allowances[owner][spender] = amount;
self.allowances[owner][spender] = current + delta;
```

You can nest more than two deep if you genuinely need to:

```otigen
storage {
    // proposal_id -> voter -> choice
    votes: Map<u256, Map<Address, Vote>>,
}

let v = self.votes[proposal_id][voter];
```

But three or more levels usually signals that the data wants a
struct or its own contract. Reach for the more structured form.

## Maps live in storage, not on the stack

This is the one rule about maps that occasionally surprises people:
**`Map<K, V>` can only appear as a storage field**. You cannot
declare a `Map` as a local variable, you cannot pass a `Map` as a
function parameter, and you cannot return a `Map` from a function.

```otigen
pub fn helper() {
    let scratchpad: Map<Address, u64>; // <-- compile error
}
```

The reason is fundamental to the storage model: a `Map` value is
*virtual*. It doesn't fit in a single slot — instead, each `(K, V)`
entry occupies a slot derived from the map's field address and the
key. There is no "the map" you could hand around as a value; what
exists is a sparse collection of slots that you address through the
map's name. The language enforces this by refusing to type
`Map<…, …>` anywhere except in `storage { … }`.

If you need an in-memory key/value table inside a function, use
`Vec<(K, V)>` and search it linearly. For most use cases the
function-local set is small enough that the linear search is fine.

## You cannot iterate a map

A second rule, related to the first: `for entry in self.some_map`
is a compile error. A `Map` does not know which keys it contains —
the runtime allocates slots only for the keys you've written to, and
there is no enumeration primitive.

```otigen
for (addr, bal) in self.balances {  // <-- compile error
    // ...
}
```

If you need to iterate, keep a parallel `Vec<K>` of the keys you've
inserted:

<span class="filename">Filename: src/Registry.oti</span>

```otigen
contract Registry {
    storage {
        names: Map<Address, String>,
        // We track insertion order in a separate Vec so we can iterate.
        owners: Vec<Address>,
    }

    pub fn set_name(name: String) {
        // First registration also records the address in the index.
        if self.names[msg.sender] == "" {
            self.owners.push(msg.sender);
        }
        self.names[msg.sender] = name;
    }

    pub fn each_owner_count() -> u64 {
        let mut total = 0u64;
        for owner in self.owners {
            let n = self.names[owner];
            // ... do something with (owner, n) ...
            total = total + 1;
        }
        return total;
    }
}
```

This is a common pattern. The discipline you take on: every write
to the map needs to keep the parallel index up to date. The
compiler can't help you remember.

## Map values get zero-initialised

Reading a map entry that has never been written returns the *zero
value* of the value type. For `u256` that's `0`; for `bool` that's
`false`; for `Address` that's `Address::ZERO`; for `String` that's
`""`; for a struct, it's the struct with every field zeroed.

```otigen
let bal = self.balances[some_random_address]; // bal is 0
```

This is what lets the erc20 contract from
[Chapter 2](ch02-00-counter-project.md) read `self.balances[to]`
inside `transfer` without first checking whether `to` has ever held
a token: a never-credited address yields `0`, the addition computes
the new balance, and the write commits.

We'll come back to the cost implications of lazy zero-initialisation
in [the next section](ch04-04-lazy-allocation.md).

## Summary

`Map<K, V>` is Otigen's general-purpose associative table. Declare
it in storage with `Map<KeyType, ValueType>`. Access with bracket
indexing; nest by nesting the type. Maps cannot live anywhere
except storage, cannot be passed as values, and cannot be iterated;
keep a `Vec<K>` next to a `Map<K, V>` if you need ordered access.
Unset entries read back the zero value of the value type.

Next we'll look at [how the compiler chooses the actual storage
slots](ch04-03-slot-layout.md) for the fields and entries we've
been declaring.
