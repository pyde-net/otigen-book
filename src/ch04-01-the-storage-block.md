# The storage block

A contract's persistent state lives inside a `storage { … }` block.
A contract may have at most *one* storage block; if it has none, the
contract is stateless and `self.foo` is a compile error.

The shape is simple — a name, a colon, a type, separated by commas:

<span class="filename">Filename: src/Wallet.oti</span>

```otigen
contract Wallet {
    storage {
        owner: Address,
        balance: u256,
        nonce: u64,
        is_frozen: bool,
    }
}
```

Four fields, four storage slots. The compiler assigns each field its
own slot in order of declaration. We'll meet the [slot layout
rules](ch04-03-slot-layout.md) in two sections; for now the relevant
point is that each field has its own home and no two fields share
one.

## Reading and writing storage

You read storage with `self.field` and write to it with `self.field
= value`. Both work inside any function of the contract:

```otigen
contract Wallet {
    storage {
        owner: Address,
        balance: u256,
    }

    pub fn deposit() {
        self.balance = self.balance + msg.value;
    }

    pub fn get_owner() -> Address {
        return self.owner;
    }
}
```

`self.balance + msg.value` reads the current balance, computes the
new one, and writes it back. The compiler tracks this for you: it
records that `deposit` *reads* and *writes* the `balance` slot,
which is the information the runtime scheduler will use to
parallelise transactions (we'll get to that in
[Chapter 15](ch15-00-access-lists.md)).

Otigen supports the usual compound-assignment forms — `+=`, `-=`,
`*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`. So `self.balance
+= msg.value` is the shorter spelling of the line above and means
exactly the same thing. Most production fixtures use the explicit
`x = x + …` form because it reads consistently with patterns like
`x = self.compute_next(x)`; pick whichever feels clearer in the
function you're writing.

## Allowed types

Almost any type can be a storage field. The set includes:

- Every integer type: `u8`–`u256`, `i8`–`i256`
- `bool`, `Address`, `String`, `bytes`
- User-defined `struct` and `enum` types
- Fixed-size arrays `[T; N]`
- Dynamic vectors `Vec<T>`
- Maps and nested maps `Map<K, V>`, `Map<K1, Map<K2, V>>`
- Tuples `(T1, T2, …)`

The full erc20 fixture exercises a representative cross-section:

<span class="filename">Filename: otic/tests/fixtures/erc20.oti (excerpt)</span>

```otigen
storage {
    name: String,
    symbol: String,
    decimals: u8,
    total_supply: u256,
    balances: Map<Address, u256>,
    allowances: Map<Address, Map<Address, u256>>,
}
```

Notice how natural the nested-map form is: `Map<Address, Map<Address,
u256>>` reads as "address → address → balance" and accesses with
`self.allowances[owner][spender]`.

## What you *cannot* declare in storage

Two restrictions are worth knowing:

**No inline initialisers.** Otigen does not let you write `count: u64
= 7` in the storage block. Every storage field starts at the *zero
value* of its type, and any non-zero initial state must be written
by a `#[constructor]`. The reasoning: deploy-time arguments (an
admin address, a name, an initial supply) need to come from the
deployment call, not from a hard-coded literal — making the
constructor the single source of init-time state keeps the model
consistent.

```otigen
storage {
    count: u64 = 7,   // <-- compile error
}
```

```sh
error: expected `,` or `}`, found `=`
  --> src/Bad.oti:3:20
   |
 3 |         count: u64 = 7,
   |                    ^ storage fields are `name: Type`; set the value in `#[constructor]`
```

**No references or borrows.** Otigen storage holds *values*, not
references. There is no equivalent of Rust's `&T` or `&mut T` at the
storage layer. Every read makes a fresh copy of the slot's contents,
and every write replaces the slot's contents wholesale.

## Naming conventions

Storage fields use *snake_case*, like all variables. The convention
is to name the slot for *what it stores* rather than its type:
`balance` rather than `balance_amount`, `is_paused` rather than
`paused_flag`, `total_supply` rather than `supply_u256`. Read the
field name once and you should know what it's for.

For boolean state, the `is_…` / `has_…` prefix reads cleanly when
the field is the condition in an `if`:

```otigen
if self.is_paused {
    revert!(ContractPaused {});
}
```

## Reading storage in `#[view]` functions

A `#[view]` function may read storage, but it may not write storage.
We'll cover view-purity in detail in [Chapter 8](ch08-01-view.md);
the rule that matters here is that you can serve query traffic
(`balance_of`, `total_supply`, `owner`, …) from `#[view]` functions
and the compiler will refuse to compile any view function that tries
to mutate a slot or emit an event:

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];  // OK — pure read
}

#[view]
pub fn mutate_oops() -> u64 {
    self.nonce = self.nonce + 1;  // <-- compile error in a #[view]
    return self.nonce;
}
```

## Summary

A contract's persistent state lives in a single `storage { … }`
block. Fields are typed; the compiler assigns each its own slot.
You read with `self.field`, write with `self.field = value` (or
the compound-assignment forms), and rely on `#[constructor]` for
any non-zero initial values. Almost every Otigen type can be a
storage field; the chief exception is references, which the
language does not have at the storage layer.

The next section is about the type that dominates real-world
storage blocks: [`Map<K, V>`](ch04-02-maps.md).
