# Events and Logs

A contract's *state* lives in storage. A contract's *history*
lives in *events*. Events are typed messages a contract emits to
the transaction receipt; block explorers index them, wallets read
them, and off-chain backends build their entire view of the
contract by consuming them.

Events are write-only. A contract emits an event during execution;
the runtime appends it to the receipt; nothing else happens. The
contract cannot read its own events back — they're for the *outside
world*, not for the contract.

This chapter covers:

- Declaring event types with the `event` keyword.
- Marking fields as `#[indexed]` so off-chain consumers can filter
  on them efficiently.
- Emitting events with the `emit` statement.

We've used events throughout the previous chapters — every project
example so far has had at least one. This chapter is the systematic
treatment.
