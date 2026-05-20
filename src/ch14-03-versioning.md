# Versioning

A deployed contract's ABI is part of its public interface. Once
clients out there are encoding calldata against an ABI, certain
changes break those clients silently — the bytes the client
sends no longer match the function the contract expects. This
section enumerates what's a breaking change and what isn't, and
covers the patterns for evolving an ABI without breaking
consumers.

## What's a breaking change

The following changes break existing callers:

**Renaming a `pub fn`.** The selector is derived from the name;
renaming changes the selector. A client that hardcoded the old
selector or computed it from the old name no longer routes to
the right function. The function is, from the outside,
*replaced* — the old name is gone.

**Reordering function parameters.** Selectors are derived from
the name, not the parameter list (Otigen, unlike Solidity,
hashes only the name). So reordering parameters doesn't
*change* the selector — but it does change what each
parameter's slot in the calldata means. A client encoding the
old order sends bytes that the new function decodes wrongly,
without any error.

This is the *most insidious* breaking change. The build
succeeds, the dispatch routes the call, and the function runs
— with wrong arguments. Be very careful about parameter order.

**Changing a parameter's type.** Same shape as reordering. A
parameter that was `u64` and is now `u256` decodes differently;
the calldata is laid out differently; clients sending the old
form get silently-wrong behaviour.

**Reordering struct fields.** Structs are positional in the
ABI. A struct that was `{ a: u64, b: u256 }` and is now `{ b:
u256, a: u64 }` encodes differently. Clients reading the old
order see the wrong values.

**Reordering enum variants.** Discriminants are positional. The
first variant gets `0`, the second gets `1`. Reordering changes
what each discriminant means. A storage field that contained
`Mode::Open` (discriminant 0) before the change suddenly means
`Mode::Closed` after.

**Reordering storage fields.** Slot indices are assigned in
declaration order. Reordering changes the slot mapping, which
breaks every read of the contract's persisted state. (This is
also covered in [Chapter 4.3](ch04-03-slot-layout.md).)

**Removing a `pub fn`, event, or error.** The function/event/
error no longer exists. Clients that referenced it get
"function not found" failures.

**Removing a struct or enum used in a function signature.** The
function can no longer be called; the type the calldata
encoded against doesn't exist.

## What's *not* a breaking change

A few changes are safe:

**Adding a new `pub fn`.** The new function has its own
selector. Clients that don't know about it don't call it. Old
calls still work.

**Adding a new event.** Indexers that don't know about it
ignore it. Existing event subscriptions still work.

**Adding a new error.** Same as events — existing error
decoders don't know about it, but they only decode errors they
*see* in revert payloads, and the contract only emits the new
error in code paths that didn't exist before.

**Adding a new storage field** at the *end* of the storage
block. New slot, no impact on existing reads. (Adding in the
middle reorders later fields and is breaking.)

**Adding a new struct or enum** that no existing function
uses. New type, no impact on existing signatures.

**Adding a new variant at the end of an existing enum.** Same
as appending storage fields. Existing discriminants are
preserved; the new variant gets a fresh discriminant. The
catch: any `match` on the enum that doesn't have a `_`
wildcard now fails exhaustiveness checking — your *code* won't
compile, but your *ABI* is still backward-compatible.

**Changing a function body** without changing its signature.
The selector is unchanged, the calldata layout is unchanged,
the return type is unchanged; only the implementation differs.
Clients are unaffected.

**Renaming a parameter** (without changing its type or
position). The parameter name is metadata; the wire encoding
is positional. The build still succeeds, the selector is
unchanged, the calldata is unchanged. Tools generating SDKs
may surface the new name; the call still works.

## Strategies for evolving an ABI

When you genuinely need a breaking change, three strategies
help:

**Add a new function instead of changing the old.** If you want
`transfer` to take a memo string in addition to `(to,
amount)`, don't add a third parameter — add a new
`transfer_with_memo(to, amount, memo)` function. The old
`transfer` keeps working; new clients use the new function.
The cost is two functions in the ABI; the benefit is no broken
clients.

**Use a proxy.** A proxy contract holds an upgradable
reference to an implementation contract. When the
implementation needs to change in a breaking way, deploy a new
implementation, point the proxy at it, and the proxy's
address doesn't change. Clients keep talking to the proxy.

The proxy pattern has its own complexities — storage slot
collisions between proxy and implementation, function selector
collisions between the two, the question of who can change the
target. We won't cover them in detail here; the proxy chapter
of OpenZeppelin's documentation translates almost directly.

**Use a façade.** A façade contract sits in front of the
"real" contract and exposes a stable interface that internally
calls whatever shape the underlying contract currently has.
The façade is a thin wrapper; the underlying contract can
evolve independently.

**Use the immutable canon.** For contracts that genuinely
should not evolve — a fixed-supply token, a fixed-supply
governance contract — *don't* deploy a proxy. Deploy a
one-shot immutable. If you ever need a "new version", that's
a separate contract at a separate address, with clients
explicitly migrating. This is the right model for many
contracts; not everything needs to be upgradable.

## Detecting breaking changes

Two tools help catch breaking changes before they ship:

**ABI diffing.** `pyde-dev abi-diff old.json new.json` (when
available) compares two `.json` files' ABIs and lists every
change, marked as breaking or non-breaking. A pre-deploy check
that the diff is clean is a useful CI gate.

**Selector-stable assertions.** If you have a list of
selectors your clients depend on, you can write a build-time
check that those selectors haven't changed. Most teams do this
with a stored list of selectors in the repo and a CI script
that compares against the current ABI.

## Summary

A function's signature, its parameter order, its parameter
types, and the order of struct and enum members all form part
of the contract's external interface. Changing any of them is
a breaking change that silently corrupts calls from existing
clients. Adding new functions, events, errors, storage fields
(at the end), and struct fields (at the end) is safe. When you
need to break, use proxies, façades, or deploy fresh; an
immutable canon is sometimes the right answer.

That's the end of the ABI chapter. The
[next chapter](ch15-00-access-lists.md) is the first of the
chain-runtime chapters — access lists and parallel execution.
