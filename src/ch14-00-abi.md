# The Otigen ABI

The *ABI* (Application Binary Interface) is the wire-format
description of a contract's public surface — every function the
contract exports, every event it might emit, every error it might
revert with, every storage field, every user-defined type.

It's what off-chain tooling reads to know how to talk to a
contract. Block explorers use it to render a contract's
behaviour. Wallet libraries use it to encode function calls.
Indexers use it to decode receipts. Type-checked client SDKs
use it to generate language-specific bindings.

This chapter covers three things:

- [Selectors](ch14-01-selectors.md) — how each function gets its
  4-byte identifier and why collisions are vanishingly
  unlikely.
- [The JSON schema](ch14-02-json-schema.md) — the structure of
  the ABI section in a `.json` artifact, with a worked example.
- [Versioning](ch14-03-versioning.md) — what counts as a
  breaking change once a contract is deployed, and the
  strategies for evolving an ABI without breaking consumers.

The Otigen ABI is *close* to the Ethereum ABI in spirit — same
selector-and-arguments call shape, same fixed-and-dynamic
encoding for variable-size types — but it has its own selector
hash, its own JSON layout, and its own event/error encoding.
The chapters explain where the lines diverge.
