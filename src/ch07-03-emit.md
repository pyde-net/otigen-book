# The `emit` statement

`emit` writes an event to the receipt. The shape is a statement
that names an event type and provides values for each field:

```otigen
emit Transfer { from: msg.sender, to: to, amount: amount };
```

That single line is the whole construct. The compiler checks that
the event type exists, that every field is provided, that the
field types match, and emits the runtime instruction that appends
the event to the receipt.

## Construction syntax

The form mirrors struct construction: `EventName { field1:
value1, field2: value2, ... }`. Field order in the literal does
*not* need to match the declaration order — fields are matched by
name.

```otigen
event Transfer {
    #[indexed]
    from: Address,
    #[indexed]
    to: Address,
    amount: u256,
}

// All three forms are equivalent:
emit Transfer { from: msg.sender, to: to, amount: amount };
emit Transfer { to: to, from: msg.sender, amount: amount };
emit Transfer {
    from: msg.sender,
    to: to,
    amount: amount,
};
```

Every field must be specified. Omitting a field is a compile
error; the language has no concept of "default field values" for
event literals.

## When (and where) to emit

The canonical ordering for a state-changing function is:

1. **Validate** inputs (`require!` checks).
2. **Mutate** storage.
3. **Emit** the event describing what changed.

```otigen
pub fn transfer(to: Address, amount: u256) {
    // 1. Validate
    require!(to != Address::ZERO, TransferToZeroAddress {});
    let from_bal = self.balances[msg.sender];
    require!(from_bal >= amount, InsufficientBalance {
        available: from_bal, required: amount,
    });

    // 2. Mutate
    self.balances[msg.sender] = from_bal - amount;
    self.balances[to] = self.balances[to] + amount;

    // 3. Emit
    emit Transfer { from: msg.sender, to: to, amount: amount };
}
```

Emit *after* the state change, not before. The reason: if the
state change reverts (because of arithmetic overflow, say), the
emit before it would survive — except the whole transaction is
rolled back, so the event would be discarded. Either order looks
correct in the happy path. But emitting *after* makes the
sequence read as "the change happened, then the world heard about
it", which matches the model. Always do it this way.

If you have two state mutations and want to emit one event per,
emit each event immediately after its corresponding mutation,
not all at the end:

```otigen
pub fn liquidate(positions: Vec<u64>) {
    for id in positions {
        self.close_position(id);                   // mutate
        emit PositionLiquidated { id: id };        // emit
    }
}
```

## Emitting events with struct or enum fields

When an event field is a struct or enum, the value passed in must
be a value of that type:

```otigen
struct Order { holder: Address, size: u256, price: u256 }

event OrderPlaced { order_id: u64, order: Order }

pub fn place_order(size: u256, price: u256) {
    let id = self.next_order_id;
    self.next_order_id = id + 1;

    let o = Order { holder: msg.sender, size: size, price: price };
    self.orders[id] = o;
    emit OrderPlaced { order_id: id, order: o };
}
```

The event payload includes the entire `Order` struct. Off-chain
consumers see the full record without needing to re-fetch storage.
This is the canonical pattern for "here's the new state of this
thing" events.

## Emitting inside a `match`

Events emit cleanly from inside `match` arms:

```otigen
match action {
    Action::Pause => {
        self.is_paused = true;
        emit Paused { by: msg.sender };
    }
    Action::Unpause => {
        self.is_paused = false;
        emit Resumed { by: msg.sender };
    }
    Action::Freeze => {
        self.is_frozen = true;
        self.frozen_at = block.timestamp;
        emit Frozen { by: msg.sender, at: block.timestamp };
    }
}
```

Each arm is its own block — they end with `}` rather than `,` —
so the body can contain multiple statements including emits.

## What you cannot do with `emit`

A few non-obvious constraints to flag.

**You cannot emit from a `#[view]` function.** `#[view]` means
"this function does not change observable state", and emitting an
event *is* a state change (the receipt is part of the on-chain
record). The compiler enforces this:

```otigen
#[view]
pub fn check(amount: u256) -> bool {
    emit Checked { amount: amount };  // <-- compile error
    return amount > 0;
}
```

```sh
error: `#[view]` functions may not emit events
  --> src/Bad.oti:3:5
   |
 3 |     emit Checked { amount: amount };
   |     ^^^^ remove `#[view]` to allow side effects
```

**You cannot read events back inside the contract.** There is no
`for e in self.previous_events { … }`; events live on the
receipt, not in storage. If your contract logic needs to know
about a past action, you must store the relevant state in
storage (and emit alongside as usual).

**You cannot conditionally emit using a function-call form.** The
parser treats `emit` as a statement keyword followed immediately
by an event-literal. You cannot do `let evt = …; emit(evt);` or
`maybe_emit(event_value)`. If you want optional emission, wrap
the emit in an `if`:

```otigen
if amount > 0 {
    emit Transfer { from: msg.sender, to: to, amount: amount };
}
```

## Anti-patterns

A few mistakes worth flagging.

**Events as memory.** Some patterns try to encode "the state of
the contract" entirely as a sequence of events, with no
on-chain storage. This works for read-only off-chain views but
doesn't work for contract logic that has to *make decisions* based
on the state — the contract can't read its own events. Use
storage for the state the contract needs, events for the history
the world needs.

**Events as cross-contract signalling.** Emitting an event in
contract A does *not* trigger any callback in contract B. The
runtime does not deliver events to listeners; events are
write-only and the chain just records them. If contract B needs
to know about contract A's action, it must be called by contract
A (cross-call) or polled by an off-chain agent that watches A's
events and calls B.

**Information-poor events.** Emitting `event TransferHappened {}`
(no fields) loses every interesting detail. Always include the
addresses, amounts, and identifiers that downstream consumers
will want to read.

## Summary

`emit EventName { field: value, … }` writes a typed log record
to the transaction receipt. Emit after the corresponding state
change, not before. Events cannot be read back by the contract,
cannot be emitted from `#[view]` functions, and cannot be used
as a cross-contract notification mechanism. Use storage for the
contract's state and events for the world's view of the
contract's history; both, always, in that order.

That's the end of Part II of the book. The
[next chapter](ch08-00-attributes.md) starts Part III, on
function attributes — `#[view]`, `#[payable]`,
`#[constructor]`, and the rest of the family we've been using
informally so far.
