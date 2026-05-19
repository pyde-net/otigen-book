# Structs, Enums, and Pattern Matching

Real contracts model their state with more shape than `u256` and
`bool`. A multisig has *transactions*, each carrying a target, a
value, a data payload, a timestamp, and a state. A governance
contract has *proposals* and *votes*. A token has *transfers* —
which are events, but with the same shape-of-records intuition.

Otigen's two facilities for shaping data are `struct` and `enum`:

- **Structs** group named fields of possibly-different types into
  one value — the *product* of those types.
- **Enums** name a fixed set of mutually-exclusive *variants* —
  the *sum* over them.

Together they cover almost every "kind of thing" you'll model in a
contract. And the `match` construct in the third section is how you
take an enum value apart safely: the compiler refuses to compile a
`match` that doesn't cover every variant, so adding a new state
forces every consumer to handle it.

This chapter takes them in that order.
