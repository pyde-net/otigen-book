# The `event` keyword

An *event* declaration creates a typed schema for a kind of log
record the contract can emit. The shape is struct-like: a name,
fields with types, optional `#[indexed]` annotations on some
fields.

## Declaring an event

The syntax is `event Name { [#[indexed]] field: Type, ... }`:

<span class="filename">Filename: src/Token.oti</span>

```otigen
event Transfer {
    #[indexed]
    from: Address,
    #[indexed]
    to: Address,
    amount: u256,
}
```

Three fields, with `from` and `to` marked indexed. The
`#[indexed]` attribute tells the runtime to place that field's
value in the receipt's *topic* slots (a fast-lookup index) rather
than in the receipt's data blob. We'll cover the trade-off in
[the next section](ch07-02-indexed.md).

You can have any number of events in a contract:

<span class="filename">Filename: src/Token.oti</span>

```otigen
contract Token {
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

    event Mint {
        #[indexed]
        to: Address,
        amount: u256,
    }

    // ... storage, errors, fns ...
}
```

## Field types

Events can carry any of the types we've seen so far:

- All integer types (`u8`–`u256`, `i8`–`i256`)
- `bool`, `Address`, `String`, `bytes`
- Fixed arrays `[T; N]` and dynamic vectors `Vec<T>`
- Structs and enums
- Tuples

The variable-size types (`String`, `bytes`, `Vec<T>`) are encoded
with a length prefix in the receipt data. They cost more gas than
fixed-size fields because the receipt has to record both length
and content; reach for them only when you actually need the
flexibility.

## Scope

Like errors, events can be declared inside a contract (scoped to
that contract — most common) or at the top of a file (visible to
every contract in the file). And like errors, declarations
across files do not share — each `event Transfer` is its own type.

Contract-scoped is overwhelmingly the right choice. The exception
is when two contracts genuinely need to emit *byte-identical*
events that an external indexer reads as one kind — for example,
two token contracts that both want to be readable by the same
ERC-20-shaped indexer. In that case, declare the event at the
file level and reference it from both.

## Doc comments

Public event declarations are exactly the place to write doc
comments. Anything you put with `///` above the event ends up in
the contract's ABI metadata next to the event's field list:

```otigen
/// Emitted whenever a value moves between two accounts. The
/// canonical "minted-from-nowhere" form uses `from = Address::ZERO`;
/// the canonical "burned-to-nowhere" form uses `to = Address::ZERO`.
event Transfer {
    #[indexed]
    from: Address,
    #[indexed]
    to: Address,
    amount: u256,
}
```

The doc text travels with the contract for the lifetime of the
deployment. Indexers can render it in their UI; tooling that
generates client SDKs can include it in the generated method
documentation.

## Naming conventions

Event names use `UpperCamelCase`. The convention that reads well:
name the event for what *happened* in the past tense. `Transfer`,
`Approval`, `Mint`, `Burn`, `Paused`, `Frozen`, `Resumed`. The
implicit subject is the contract itself; the event says "a thing
of this kind happened to me".

A few patterns to *avoid*:

- **Verb-prefixed names that read like actions**: `DoTransfer`,
  `SubmitProposal`. Names that read as actions invite the reader
  to wonder "*who* is doing the action?" Better: `Transfer`,
  `ProposalSubmitted`.
- **Names that describe a function**: `TransferCalled`,
  `TransferFromExecuted`. The event is about what happened, not
  which entry-point did it. Use the same event from multiple
  functions when the same thing happened.

## Events vs storage: don't conflate

Events are *not* state. The contract cannot read them back. The
runtime never queries them. If you find yourself wanting to "look
up the last event", you actually want a storage field that mirrors
the event payload — and then *both*: write the storage, emit the
event, in that order.

```otigen
self.last_transfer = (msg.sender, to, amount);  // storage
emit Transfer { from: msg.sender, to: to, amount: amount };  // event
```

The storage field is for the contract; the event is for the world.

## ABI representation

The ABI entry for an event includes:

- The event name
- The list of fields, in declaration order, with their types
- For each field, whether it's `#[indexed]`
- The doc comment, if any

Block explorers, indexers, and SDK generators read this. We'll
look at the JSON form in [Chapter 14](ch14-02-json-schema.md).

## Summary

Declare events with `event Name { field: Type, ... }`. Mark
fields you want indexers to filter on with `#[indexed]`. Use
past-tense names that describe what happened. Events are
emit-only — they do not double as state.

The [next section](ch07-02-indexed.md) is about the topic
mechanism and what `#[indexed]` actually buys you.
