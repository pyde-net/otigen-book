# Static inference

An *access list* for a function is the set of storage slots
that function will read and the set it will write. If the
compiler can derive these sets from the source, the runtime
gets the information for free; if it cannot, the runtime has to
discover the access pattern at execution time (via Block-STM
speculation — covered in
[Section 15.3](ch15-03-dynamic-paths.md)).

Otigen's typed `storage { … }` block makes the inference
tractable for the common case. This section explains the
mechanism, the cases that work cleanly, and the cases that
don't.

> The static-inference pass is *not yet* in the otic compiler.
> The transaction wire format and the runtime checks are
> ready; the compiler currently emits no per-function access
> list. The shape below is the target design.

## What inference looks at

Given a function body, the compiler walks the AST and notes
every storage access:

- `self.field` — read of `field`'s slot.
- `self.field = expr` — write to `field`'s slot.
- `self.map[key]` — read of the slot derived from `(map, key)`.
- `self.map[key] = expr` — write to that slot.
- `self.field += expr` — read *and* write.

The compiler collects the set of slots accessed and emits, per
function, two lists: `reads` and `writes`. These get bundled
into the `.pyc` artifact alongside the function's bytecode.

## The "cleanly inferable" case

A function like `balance_of` is trivial:

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];
}
```

The compiler sees one storage access: `self.balances[owner]`.
The slot is `(balances_slot_index, owner)`. The function's
access list:

```text
reads:  [ (balances, owner_from_param) ]
writes: []
```

A `transfer` is only slightly more:

```otigen
pub fn transfer(to: Address, amount: u256) {
    let from_bal = self.balances[msg.sender];   // read
    require!(from_bal >= amount, …);
    self.balances[msg.sender] = from_bal - amount;  // write
    self.balances[to] = self.balances[to] + amount; // read + write
}
```

The access list:

```text
reads:  [ (balances, msg.sender), (balances, to) ]
writes: [ (balances, msg.sender), (balances, to) ]
```

Two writes to the `balances` map (one keyed by `msg.sender`,
one keyed by `to`), plus the corresponding reads.

The key insight: even though the *specific* slots depend on
runtime values (`msg.sender`, `to`), the *shape* of the access
is statically known — "the `balances` map, keyed by these two
addresses". The runtime can take that shape, fill in the
addresses at submission time, and have a complete access list
before execution.

## What "shape" means precisely

The compiler emits access entries of the form `(field,
key_expr)` where `key_expr` is symbolic — referring to a
function parameter, `msg.sender`, or another statically-known
value. At submission time, the submitter (or a simulator)
substitutes concrete values to produce the runtime access list.

So the static output for `transfer(to: Address, amount: u256)`
is something like:

```text
reads:  [ balances[msg.sender], balances[to] ]
writes: [ balances[msg.sender], balances[to] ]
```

At runtime, with `msg.sender = 0xAB...` and `to = 0xCD...`,
this becomes:

```text
reads:  [ balances[0xAB...], balances[0xCD...] ]
writes: [ balances[0xAB...], balances[0xCD...] ]
```

The substitution is mechanical. The compile-time output is the
template; the runtime value is the instantiation.

## Cases the compiler handles cleanly

- **Field access on `self.field`.** The slot is fixed at
  compile time.
- **Map access on `self.map[key]`** where `key` is a function
  parameter, `msg.sender`, `address(self)`, or a let-bound
  local with a static value path. The shape is known; the
  runtime substitutes the value.
- **Nested map access on `self.outer[a][b]`** where `a` and
  `b` follow the rules above.
- **Conditional accesses inside `if`/`match`**. The compiler
  records the *union* of slots across all branches — the
  access list lists what *might* be touched, not what
  necessarily will be. The scheduler treats the conservative
  estimate as the dependency.
- **Iteration over a `Vec`**. If the function loops over a
  vector and reads/writes each element's keyed slot, the
  compiler records the slot pattern keyed by the loop
  variable, and the runtime substitutes the loop bounds at
  execution time.

## Cases that defeat static inference

Some access patterns are genuinely *dynamic* — the slot
accessed depends on runtime values that aren't function inputs:

- **Map access keyed by a value read from another slot.**
  `self.map[self.some_field]` — the slot is `(map, X)` where
  `X` is itself a storage value. The compiler can record that
  *some* slot of `map` is read, but not *which*; the runtime
  has to discover the key by executing.
- **Map access keyed by the return value of a function call.**
  `self.map[helper()]` — the helper function might be pure,
  but the compiler can't fold its result in general.
- **Cross-contract calls.** `IToken::at(addr).transfer(...)`
  reads storage in the *other* contract; the compiler has no
  visibility into that contract's access pattern unless it has
  the other contract's source.
- **`raw_call!`** — the calldata is arbitrary bytes; the
  compiler can't know what the target will do.
- **Storage access from an inlined hot-path that touches a
  slot indirectly** — e.g., a `Vec` whose length is read,
  then iterated based on that length.

For these cases, the function's emitted access list is
*incomplete* (or empty, if the compiler can't infer anything).
The runtime then has to discover the access pattern by
executing the function — and uses *Block-STM speculation*
(next section) to do this without sacrificing parallelism.

## Two-tier access lists

The design separates statically-inferred from
dynamically-discovered slots:

- **The static access list** is what the compiler emits at
  build time. Conservative: only slots the compiler is *sure*
  the function might touch.
- **The runtime access list** is what the actual transaction
  carries — derived from the static list by substituting
  runtime values, then expanded by Block-STM if the static
  list was incomplete.

A transaction's wire format carries the runtime list. The
scheduler reads it; the runtime checks against it on every
storage op. If the function touches a slot not in the list, the
PVM traps with `AccessListViolation` and the transaction
reverts. This makes the access list *honest*: a function that
claims to touch only some slots cannot sneak access to others.

## In the meantime

While the compiler-side inference is being implemented:

- The transaction wire format already carries the access list
  (look at `engine/crates/tx/src/types.rs` for the
  `AccessEntry` struct).
- The PVM already enforces the access list at runtime, trapping
  with `AccessListViolation` on any unlisted access.
- Today, the chain populates the access list by *simulation*:
  before final execution, it runs the transaction speculatively
  to observe which slots it touches, then includes those slots
  in the access list for the real execution.

When the compiler's inference pass lands, the simulation step
becomes optional for the common case — the access list is
known from build time, and the runtime can schedule the
transaction without a discovery pass.

## Summary

Static inference derives a function's access list from the
typed storage block. The common case — field accesses and
parameter-keyed map accesses — is straightforward; the
compiler emits a template that gets substituted at submission
time. Dynamic cases (storage-keyed map accesses,
cross-contract calls, `raw_call!`) defeat inference and need
runtime discovery instead. The PVM enforces the access list
honestly: any unlisted access traps with `AccessListViolation`.

The compiler-side inference is on the roadmap; the
transaction-format and runtime-check sides are already in
place.

The [next section](ch15-02-scheduler.md) covers what the
scheduler does with the access lists once it has them.
