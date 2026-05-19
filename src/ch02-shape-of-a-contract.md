# The shape of a contract

A `contract { ... }` block is the only top-level container Otigen has for
the things a smart contract is made of: persistent state, externally
callable behaviour, the events the chain will emit, and the errors that
revert it. This chapter takes the contract anatomy in pieces and explains
what each piece is for.

We'll work against a more realistic example than the starter `Counter`:
the ERC-20-shaped fungible token in `otic/tests/fixtures/erc20.oti`. It is
small enough to read in one sitting and uses every sub-block worth
discussing.

## 2.1 The five blocks

Inside `contract Name { ... }` you can have, in any order:

| Block | Purpose |
|---|---|
| `storage { ... }` | Persistent on-chain state |
| `event Name { ... }` | An event type the contract may emit |
| `error Name { ... }` | An error type the contract may revert with |
| `struct Name { ... }`, `enum Name { ... }`, `const NAME: ...`, `type Alias = ...` | Locally-scoped helper definitions |
| `fn name(...) { ... }` | A function (public or internal) |

A contract can have at most **one** `storage` block. Everything else
(events, errors, functions, structs) can appear any number of times.

Items declared inside a contract are *scoped* to the contract: another
contract's `error InsufficientBalance` is a different type than this
one's, even if the fields are identical. There is no implicit cross-
contract sharing of definitions.

If you need a struct or interface visible to multiple contracts, declare
it at the top level of the file (outside any `contract { ... }`); the
compiler then makes it visible to anything in the same module.

## 2.2 The full example

```otigen
contract PydeToken {
    storage {
        name: String,
        symbol: String,
        decimals: u8,
        total_supply: u256,
        balances: Map<Address, u256>,
        allowances: Map<Address, Map<Address, u256>>,
    }

    event Transfer {
        #[indexed]
        from: Address,
        #[indexed]
        to: Address,
        amount: u256,
    }

    event Approval {
        #[indexed]
        owner: Address,
        #[indexed]
        spender: Address,
        amount: u256,
    }

    error InsufficientBalance { available: u256, required: u256 }
    error InsufficientAllowance { available: u256, required: u256 }
    error TransferToZeroAddress {}

    #[constructor]
    pub fn init(name: String, symbol: String, decimals: u8, initial_supply: u256) {
        self.name = name;
        self.symbol = symbol;
        self.decimals = decimals;
        self.total_supply = initial_supply;
        self.balances[msg.sender] = initial_supply;
        emit Transfer { from: Address::ZERO, to: msg.sender, amount: initial_supply };
    }

    pub fn transfer(to: Address, amount: u256) {
        require!(to != Address::ZERO, TransferToZeroAddress {});
        let from_bal = self.balances[msg.sender];
        require!(from_bal >= amount, InsufficientBalance {
            available: from_bal,
            required: amount,
        });

        self.balances[msg.sender] = from_bal - amount;
        self.balances[to] = self.balances[to] + amount;
        emit Transfer { from: msg.sender, to: to, amount: amount };
    }

    pub fn approve(spender: Address, amount: u256) {
        self.allowances[msg.sender][spender] = amount;
        emit Approval { owner: msg.sender, spender: spender, amount: amount };
    }

    pub fn transfer_from(from: Address, to: Address, amount: u256) {
        require!(to != Address::ZERO, TransferToZeroAddress {});
        let allowance = self.allowances[from][msg.sender];
        require!(allowance >= amount, InsufficientAllowance {
            available: allowance,
            required: amount,
        });

        self.allowances[from][msg.sender] = allowance - amount;

        let from_bal = self.balances[from];
        require!(from_bal >= amount, InsufficientBalance {
            available: from_bal,
            required: amount,
        });

        self.balances[from] = from_bal - amount;
        self.balances[to] = self.balances[to] + amount;
        emit Transfer { from: from, to: to, amount: amount };
    }

    #[view]
    pub fn balance_of(owner: Address) -> u256 {
        return self.balances[owner];
    }

    #[view]
    pub fn allowance(owner: Address, spender: Address) -> u256 {
        return self.allowances[owner][spender];
    }

    #[view]
    pub fn get_total_supply() -> u256 {
        return self.total_supply;
    }
}
```

Read it once end-to-end before we walk through the pieces. If you've
written a Solidity ERC-20 you'll find very little surprising in the
shape; the rest of the chapter is about why each line says what it says.

## 2.3 `storage`

The storage block declares every piece of persistent state the contract
will ever have. Each field becomes a typed storage slot. The compiler
allocates slots sequentially starting at 0 and never overlaps them; you
will never write a slot number by hand, and you cannot accidentally
shadow another field by misnumbering one.

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

Three things to notice:

**Fields are typed**. `name: String`, `decimals: u8`. Solidity infers a
storage slot's *bit width* from the declared type (which is why a
`uint8` and a `uint256` collide differently inside a struct). Otigen
gives every field its own slot; the type is for the language, not for
the slot layout.

**Maps live in storage, not in stack variables**. You can declare a
`Map<K, V>` field, but you cannot declare a `Map<K, V>` as a local
variable inside a function. Maps are persistent by definition. If you
need an in-memory key/value store, build it from a `Vec<(K, V)>`.

**Maps nest naturally**. `Map<Address, Map<Address, u256>>` reads in the
order you'd write it: "address → address → balance". Access is
`self.allowances[owner][spender]`. Storage is allocated lazily — an
unwritten map entry costs nothing.

A field's *initial* value is determined by the constructor. Otigen does
not allow inline initialisers in the storage block, because the
constructor is the one place where deployment-time inputs (like the
token's name) can flow into state. Declared without being written,
fields are zero-initialised: `0` for integers, `false` for `bool`, the
zero address (`Address::ZERO`) for `Address`, the empty string for
`String`.

## 2.4 `event`

Events are the contract's way of telling indexers and off-chain
listeners what happened. An event is a typed payload that lands in the
transaction receipt — the runtime does *not* read events back. They are
write-only signalling.

```otigen
event Transfer {
    #[indexed]
    from: Address,
    #[indexed]
    to: Address,
    amount: u256,
}
```

`#[indexed]` on a field promotes it to a *topic* on the receipt entry. A
caller can subscribe to "all `Transfer` events whose `from` equals
0xABC..." cheaply because the runtime indexes topics; non-indexed fields
are part of the unstructured `data` blob and must be deserialised by the
listener.

You may mark up to **three** event fields as `#[indexed]`. If you mark a
fourth, the compiler rejects the event. The limit is a property of the
PVM log format — every receipt entry has a fixed `topics` array.

Emit an event with the `emit` statement:

```otigen
emit Transfer { from: msg.sender, to: to, amount: amount };
```

The field order in the literal does not need to match the event
declaration. Fields are matched by name.

## 2.5 `error`

Otigen errors are typed structs you `revert!` or `require!` with. A
caller sees the typed payload — `InsufficientBalance { available: 100,
required: 200 }` — in the revert data, with no string parsing required.

```otigen
error InsufficientBalance { available: u256, required: u256 }
error TransferToZeroAddress {}
```

Errors with no fields are written `Name {}` at both declaration and call
site. The empty braces are mandatory — they distinguish an error type
from a possibly-incomplete declaration.

The reason for typed errors is the same reason language designers
generally prefer typed errors over strings: tools can do useful things
with them. An indexer aggregating "all token transfers that ran out of
balance" can match on the error *type* rather than parsing
`"INSUFFICIENT_BALANCE"`. A composing contract can pattern-match.

`require!` accepts either a typed error or a string literal. Internal
contracts and quick scripts often use the string form; production
contracts almost always declare typed errors and use them.

```otigen
require!(from_bal >= amount, InsufficientBalance {
    available: from_bal,
    required: amount,
});
```

## 2.6 Functions

Functions are where behaviour lives. A function declaration looks like:

```otigen
[#[attribute]]
pub fn name(arg: Type, ...) -> ReturnType {
    body
}
```

Pieces you can mix and match:

- **`pub`** — visibility. `pub` means callable from outside via the
  ABI; omitted means *internal* (callable only from other functions in
  the same contract).
- **Attributes** — `#[constructor]`, `#[view]`, `#[payable]`,
  `#[reentrant]`, `#[receive]`, `#[fallback]`, `#[test]`,
  `#[sponsored]`. See the next section.
- **Parameters** — names + types. Solidity-style "name first, type
  second" with a colon between, like Rust and unlike Solidity.
- **Return type** — `-> Type`. Omitted means no return value
  (equivalent to `-> ()`). A return type is mandatory for `#[view]`.

A few details to flag:

**`pub` is the ABI surface.** Only `pub` functions get a selector and
appear in the JSON ABI. An internal function is invisible from outside
the contract. If your test calls `c.helper()` and `helper` is not
`pub`, the compiler will refuse to generate the test invocation.

**No `external` / `public` distinction.** Solidity distinguishes
`external` (only callable from outside) and `public` (callable from
inside *and* outside). Otigen has only `pub`. Calls from inside the
contract that target a `pub` function are still direct calls (no
external dispatch overhead) — the compiler optimises them
automatically.

**Parameters are by-value.** You receive a copy of the argument. Otigen
has no "memory" vs "calldata" annotation; the calldata distinction
exists at the ABI boundary, but inside the function you just have a
value.

## 2.7 Function attributes

There are eight attributes that change how a function behaves. They are
the principal lever for telling the compiler what kind of function you
mean.

### `#[constructor]`

Runs once, at deploy time. Must be `pub`. Cannot return a value. Cannot
be marked `#[view]`, `#[reentrant]`, or `#[test]`. The constructor is
the only place where the contract's deploy-time inputs (constructor
arguments) flow into state. After deployment, the constructor is
unreachable: it has no selector and no entry in the dispatch table.

```otigen
#[constructor]
pub fn init(name: String, symbol: String, decimals: u8, initial_supply: u256) {
    self.name = name;
    ...
}
```

You may *not* call the constructor from another function, even from
inside the contract.

### `#[view]`

Marks a function as read-only. A `#[view]` function:

- Cannot write to any `self.field` (storage write is a compile error).
- Cannot `emit` events.
- Cannot use any macro other than `require!`, `assert!`, `revert!` —
  `cross_call!`, `raw_call!`, `deploy!` are all rejected.
- Must transitively call only other view-safe functions. If you call
  an internal helper from a `#[view]` and that helper writes storage,
  the compiler refuses to compile the view function. This is *static*
  enforcement, not honour-system.
- Must have a return type. A view that returns nothing is a no-op and
  the compiler treats omission of `->` as an error.

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];
}
```

`#[view]` functions are free to call off-chain (they don't need to be
in a transaction). Clients use them for read-only queries — balance
checks, getters, derived state.

### `#[payable]`

Allows the function to receive native PYDE in the same transaction
that calls it. Inside the body, `msg.value` is the number of PYDE
quanta sent. Without `#[payable]`, *any* use of `msg.value` is a
compile error — even reading it, because reading it would suggest the
function is supposed to handle value.

`#[view]` and `#[payable]` are mutually exclusive (a view cannot
receive funds), and the constructor cannot be `#[payable]` either —
deployment is a separate transaction with its own value semantics, not
a regular call.

### `#[reentrant]`

Disables the default reentrancy guard for this one function. The
guard, which we'll cover in detail in Chapter 13, is on by default
for every `pub` non-view function. Marking a function `#[reentrant]`
is an explicit, opt-in statement that this function expects to be
re-entered.

You should almost never need this. The two legitimate use cases are
contracts that *intentionally* call themselves through a cross-contract
hop (rare) and contracts that compose with an external callback pattern
where the external party's code is trusted.

### `#[receive]` and `#[fallback]`

`#[receive]` is the function the runtime calls when the contract is
sent native PYDE with no calldata (a bare value transfer). It must be
`pub`, `#[payable]`, take no parameters, and return nothing.

`#[fallback]` is the function the runtime calls when the calldata's
selector doesn't match any function. It must be `pub`, take no
parameters, and return nothing. It may also be `#[payable]`.

These are advanced features used by proxies and forwarders. Most
contracts have neither.

### `#[test]`

Marks the function as a test that `pyde-dev test` will run inside an
embedded PVM. Tests cannot be deployed to a real network — the
selector is suppressed in production builds — and they live in `test/`
rather than `src/`.

### `#[sponsored]`

Marks the function as opting in to gas sponsorship: the *caller* does
not pay; either a chain-wide gas tank or a named paymaster contract
does. `#[sponsored(Paymaster)]` names a specific paymaster.

Sponsored functions are an advanced feature and have their own chapter
later in the book.

## 2.8 The default reentrancy guard

Every public function that is not `#[view]`, `#[constructor]`, or
`#[reentrant]` is wrapped at codegen time with a reentrancy guard. The
guard uses a reserved storage slot (slot index `0x3FFFE`, well outside
the user-allocated range that starts at 0) to track whether the
contract is currently inside a call.

```text
pub fn transfer(to: Address, amount: u256) {
    // (auto-inserted) require!(guard == 0); guard = 1;
    ...your code...
    // (auto-inserted) guard = 0;
}
```

The effect: if `transfer` calls into an external contract, and that
contract tries to call back into *this* contract, the second entry
hits the still-set guard and reverts. The DAO hack does not happen.

This is *on by default*. To opt out, mark the function `#[reentrant]`.
We'll come back to the trade-offs in [Chapter 13](ch13-reentrancy.md).

## 2.9 Internal helper items

Inside a contract you may declare local helper types and constants:

```otigen
contract Lending {
    struct LoanRecord {
        borrower: Address,
        principal: u256,
        rate_bps: u32,
    }

    enum LoanStatus { Open, Repaid, Defaulted }

    const MAX_LTV_BPS: u32 = 7500;

    type Bps = u32;

    // ...storage, events, errors, fns...
}
```

These items are scoped to the contract: `LoanRecord` declared inside
`Lending` is not the same type as `LoanRecord` declared inside another
contract, even if their fields match. If you need a struct visible to
many contracts, hoist it out to the top level of the file.

`const` values must be compile-time integer literals (or expressions
the constant evaluator can reduce). `type Alias = Existing` introduces a
name for an existing type; it does not create a new nominal type.

## 2.10 The compilation artifact

When `pyde-dev build` finishes, you'll find `out/<ContractName>.pyc` in
your project. The `.pyc` file is JSON; it contains:

```json
{
  "name": "PydeToken",
  "bytecode": "0x...",
  "abi": [ ... ],
  "metadata": {
    "compiler_version": "...",
    "source_hash": "0x...",
    "access_lists": { ... }
  }
}
```

- **`bytecode`** is the PVM instruction stream the runtime executes.
- **`abi`** is the JSON ABI — one entry per `pub` function, plus
  events and errors, plus the constructor.
- **`metadata.access_lists`** is the most distinctively Otigen part of
  the artifact. For each function, the compiler emits the list of
  storage slots it reads and writes. The runtime scheduler reads
  these to run independent transactions in parallel. We'll come back
  to access lists in [Chapter 18](ch18-access-lists.md).

You can paste a `.pyc` into a deploy script via the `pyde-dev script`
runner, or hand it to any client that speaks Pyde's JSON-RPC.

## 2.11 What we covered

A contract is the unit Otigen deploys. Inside its braces are exactly the
things a contract is made of:

- **`storage`** — one block, declares persistent state.
- **`event`** — typed payloads emitted to receipts.
- **`error`** — typed payloads carried in revert data.
- **`fn`** — behaviour, with attributes that tell the compiler what
  kind of function it is.

The compiler does meaningful work on your behalf: storage slots are
laid out automatically, reentrancy guards are inserted into public
mutating functions, view purity is statically enforced, and access
lists are emitted alongside the bytecode for the scheduler to use.

The [next chapter](ch03-common-syntax.md) zooms in on the syntax that
appears inside function bodies — bindings, expressions, control flow,
and the parts of the language that are the same as Rust because they
were never the problem.
