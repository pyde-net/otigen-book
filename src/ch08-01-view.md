# `#[view]` and view purity

A `#[view]` function is one the compiler guarantees does not
mutate state. Marking a function `#[view]` lets callers (block
explorers, indexers, RPC clients, other contracts) call it as a
*pure query* without sending a transaction — and lets the runtime
schedule it alongside any number of others without worrying about
ordering.

The guarantee is *static*: the compiler refuses to compile a
`#[view]` function that violates the contract, even transitively
through other functions it calls. There is no run-time check; the
attribute is a compile-time gate on what the function can do.

## Declaring a view function

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];
}
```

Three rules that the syntax exposes:

- `#[view]` sits above the function declaration.
- A `#[view]` function *must* have a return type. `-> ()` is not
  enough; the compiler rejects a view with no observable output as
  "a view with no return value cannot be useful". If you want a
  side-effect-free helper that returns nothing, write a plain
  internal `fn` without `#[view]`.
- `#[view]` is usually paired with `pub`. An internal `#[view] fn`
  is permitted but rare; the attribute primarily exists for the
  ABI surface.

## What `#[view]` forbids

The view-purity analysis rejects a function that does any of the
following:

**Writes to storage.** Any `self.field = ...` (including compound
assignments like `self.field += 1`), any `self.map[key] = ...`,
any field write through a struct in storage.

```otigen
#[view]
pub fn bad_view() -> u64 {
    self.counter = self.counter + 1;  // <-- compile error
    return self.counter;
}
```

**Emits an event.** `emit` is a write to the receipt, which is a
form of observable state.

```otigen
#[view]
pub fn bad_view2() -> u64 {
    emit Read { who: msg.sender };    // <-- compile error
    return self.counter;
}
```

**Uses an impure macro.** Most macros are impure (they mutate
state, emit events, or call other contracts). The ones a view may
use are limited to: `require!`, `assert!`, and `revert!`. The
following are *all* forbidden inside a `#[view]`:

- `emit` — write to the receipt
- `cross_call!` — calls another contract, which may mutate
- `raw_call!` — same reason
- `deploy!` — deploys a new contract

```otigen
#[view]
pub fn bad_view3() -> u256 {
    let (ok, _) = raw_call!(
        target: 0xCC...CC as Address,
        calldata: b"",
        gas: 1000,
        value: 0,
    );
    return 0;
}
```

```sh
error: `#[view]` function may not use `raw_call!`
  --> src/Bad.oti:3:18
   |
 3 |     let (ok, _) = raw_call!(
   |                   ^^^^^^^^^^ this macro can mutate state
   |
   = note: only `require!`, `assert!`, and `revert!` are permitted
           inside `#[view]` functions
```

**Calls an impure function transitively.** This is the
"transitively" half of "statically enforced, transitively". The
compiler walks the call graph: if `view_a` calls internal helper
`helper_b`, and `helper_b` writes to storage, then `view_a` is
itself impure and may not be marked `#[view]`.

```otigen
fn impure_helper() {
    self.counter = self.counter + 1;
}

#[view]
pub fn bad_view4() -> u64 {
    impure_helper();                  // <-- compile error
    return self.counter;
}
```

```sh
error: `#[view]` function `bad_view4` calls impure function `impure_helper`
  --> src/Bad.oti:8:5
   |
 8 |     impure_helper();
   |     ^^^^^^^^^^^^^^^ this function writes to storage
   |
   = help: mark `impure_helper` as `#[view]` or move the mutation
           out of `bad_view4`
```

This is the part that makes the guarantee real. A naive
honour-system `view` (Solidity-style) lets a single mutating
helper silently break the contract. Otigen's transitive
check makes it impossible to ship.

## What `#[view]` permits

A view function *may*:

- Read any storage field, including map values and nested map
  values.
- Read the built-in globals: `msg.sender`, `block.timestamp`,
  `address(self)`, all of them.
- Use the pure macros: `require!`, `assert!`, `revert!`.
- Compute any pure expression: arithmetic, comparison, casts.
- Call other `#[view]` functions, internal or external.
- Return any value of any type — including structs and enums.

So the surface a view function operates on is "read freely, return
anything, fail loudly".

## Calling a view function

From inside the same contract, a call to a `#[view]` function
looks exactly like any other call:

```otigen
pub fn deposit() {
    let prev = self.balance_of(msg.sender);  // reads via view
    // ... mutate ...
}
```

From outside the contract, a view function can be called *without
sending a transaction*. RPC clients have a `call` method (the
analog of Solidity's `eth_call`) that runs the view against the
current state and returns the result, no gas paid by anyone. This
is what wallet UIs use to display balances: a billion `balance_of`
calls would cost zero gas because none of them are transactions.

From another contract, calling a `#[view]` is just a normal
cross-contract call. Note that the *other* contract's call site
has to also be inside a function that can call non-mutating code
(or any function, really — view-purity only restricts the callee's
behaviour, not the caller's).

## When *not* to mark a function `#[view]`

A few cases where `#[view]` is technically valid but a bad fit:

**The function is going to grow into something stateful.** If
you're writing a getter that will eventually need to update an
internal cache, leave off `#[view]` — adding it now and removing
it later is a breaking ABI change.

**The function is internal-only and trivial.** A two-line internal
helper doesn't need `#[view]`. The attribute exists for the ABI
contract; internal helpers don't have an ABI entry.

**The function reads storage but its semantics are inherently
about a moment in time.** `current_block_number()` is a `#[view]`,
but `is_after_deadline()` is a strange thing to mark as a view —
its answer changes as time passes, which makes it confusing for
an external caller to reason about. Mark it `#[view]` if you must,
but consider whether you actually want it to be a callable
endpoint at all.

## Why this is enforced statically

The cost of getting view-purity wrong shows up in production. A
view function that mutates state will, if called via `eth_call`,
*appear* to mutate (the RPC node executes it speculatively and
sees the state changes), but those mutations vanish when the call
returns — leading to mysterious "the indexer thought this state
was true but the chain disagrees" bugs. Solidity has lived with
these for years.

Otigen's static analysis says: if the compiler can prove the
function is pure, the runtime's behaviour is consistent (the view
returns its value, makes no changes). If the compiler can't prove
purity, the language refuses to let you label the function as a
view. The cost is occasional friction when you wanted to mark a
"morally pure" function whose helper happens to write to a cache;
the benefit is that the property holds *unconditionally*.

## Summary

`#[view]` declares a function as read-only. The compiler enforces
the contract statically and transitively: no storage writes, no
event emission, no impure macros, and no calls to impure
functions. The result is a guarantee callers can rely on: a view
can be invoked off-chain via RPC `call`, scheduled freely by the
runtime, and trusted not to mutate the chain.

The [next section](ch08-02-payable.md) covers the inverse
attribute — `#[payable]`, for functions that explicitly *do*
mutate state by receiving native value.
