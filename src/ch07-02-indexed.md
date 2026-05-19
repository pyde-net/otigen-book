# `#[indexed]` topics

Marking an event field with `#[indexed]` places its value in one
of the receipt's *topic* slots. Topics are what off-chain indexers
filter on; placing the right fields in topics makes the difference
between "give me all Transfer events from this address" being a
constant-time lookup or a linear scan.

This section explains what topics are, when to use them, and the
limit you must respect.

## What topics are

Every receipt entry — the on-chain record of an emitted event —
has two kinds of data:

- A **topics** array, of up to four 32-byte values. The first
  topic is always the event's *type hash* (a Poseidon2 hash of
  the event name and field types). Topics 1, 2, and 3 are the
  values of any `#[indexed]` fields.
- A **data** blob — opaque bytes carrying the values of every
  non-indexed field in ABI encoding.

Indexer infrastructure builds a B-tree keyed on `(contract,
topic0, topic1, topic2, topic3)` — so a query like "all Transfer
events from this contract where topic1 = some address" hits the
index and returns instantly. A query that filters on a non-indexed
field has to scan every Transfer.

## The limit: three indexed fields

The format reserves topic 0 for the event type hash, leaving
topics 1, 2, and 3 for `#[indexed]` fields. So **at most three
fields per event** can be marked indexed.

```otigen
event Trade {
    #[indexed]
    pool: Address,    // topic1
    #[indexed]
    buyer: Address,   // topic2
    #[indexed]
    seller: Address,  // topic3
    price: u256,      // data
    quantity: u256,   // data
}
```

The current compiler does not yet *reject* events with a fourth
indexed field at the source level — the parser accepts the
annotation and the typechecker passes. But at codegen, only the
first three are placed into topics; the rest are silently moved
into the data blob. The on-chain effect is that the fourth and
later `#[indexed]` markers are ignored.

Treat the three-field limit as hard. Reorder your fields so the
three you most want to index are the first three with the
attribute, and verify the contract's ABI matches your expectation
before you ship.

## Choosing what to index

The right question is: *what queries will the off-chain consumer
want to run?* Index the fields the consumer will filter on.

For a token's `Transfer { from, to, amount }`:

- Index `from` so wallets can show "all outgoing transfers from
  this user".
- Index `to` so wallets can show "all incoming transfers to this
  user".
- Don't index `amount`, because no realistic query filters on
  exact amount. Range queries on `amount` would still be a scan
  even with indexing.

For a governance `Voted { proposal_id, voter, choice }`:

- Index `proposal_id` so the UI can show "all votes on this
  proposal".
- Index `voter` so a profile page can show "all votes by this
  address".
- `choice` is rarely a useful filter on its own; leave it in the
  data blob.

For a market `Trade { pool, buyer, seller, price, quantity }`:

- Index `pool` (you'll have many pools; each has its own feed).
- Index `buyer` and `seller` to show per-user trade history.
- Don't index `price` and `quantity`; they're per-trade values.

The exhaustion of the three-topic budget is the usual constraint.
When you have four candidates and only three slots, pick the
queries you actually run — the others can be served by scanning
the data blob, which is slower but possible.

## What can be indexed

Any field whose value fits in 32 bytes can be indexed: integer
types up to `u256` / `i256`, `Address`, `bool`, fixed-size byte
arrays.

Variable-size values (`String`, `bytes`, `Vec<T>`) *can* be
indexed too, but with a wrinkle: the topic stores the *hash* of
the value, not the value itself. So an indexer filtering on a
`String`-typed indexed field has to know the hash of the string it
wants to find, not the string. This is rarely what you want;
prefer fixed-size types for indexed fields.

## Gas cost

Each indexed field costs slightly more to emit than a non-indexed
one — the runtime hashes the value into the topic slot. The
difference is small (a few hundred gas per indexed field) but
not zero. If a field is genuinely never going to be filtered on,
leaving it out of the index saves gas.

That said: the dominant cost of an event is the size of the data
blob, not the number of topics. Don't sweat one extra topic to
save a few hundred gas if it makes the contract harder to index.

## Conventions

A few habits that show up in well-indexed contracts:

- **Identity-bearing fields are usually indexed.** Addresses,
  account ids, proposal ids, trade ids — the things that say
  "*who* is this about" — go in topics.
- **Magnitude fields rarely are.** Amounts, prices, sizes,
  durations — the things that say "*how much*" — go in data.
- **Reserve a topic for the "primary key" of the event.** If your
  event describes an action on a particular object (a trade in a
  pool, a transfer in a token), the object's id should be the
  first indexed field. Indexers and users will sort by that.

## Summary

`#[indexed]` places a field's value in one of the receipt's
topic slots, making it cheap for off-chain consumers to filter on.
Topics 1, 2, and 3 are available (topic 0 is the event type hash);
at most three fields per event can be indexed in a way the runtime
records. Index identity-bearing fields, leave magnitude fields in
the data blob, and reorder your event declarations if you've used
more than three indexed annotations.

The [next section](ch07-03-emit.md) covers the `emit` statement
that actually triggers an event.
