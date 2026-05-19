# The `error` keyword

An *error* in Otigen is a struct-shaped value that travels in the
revert data when a transaction fails. You declare an error type
once with the `error` keyword, then construct an instance of it
wherever you want to revert with that failure reason.

## Declaring an error

The syntax mirrors `struct`: `error Name { field: Type, ... }`.
Where you place the declaration controls who can see it.

<span class="filename">Filename: src/Token.oti</span>

```otigen
contract Token {
    error InsufficientBalance { available: u256, required: u256 }
    error TransferToZeroAddress {}
    error Frozen { since: u64 }

    storage {
        balances: Map<Address, u256>,
        is_frozen: bool,
        frozen_at: u64,
    }

    // ...
}
```

Three error declarations:

- `InsufficientBalance` carries two `u256` fields. A caller who sees
  this error in the revert data knows both the actual balance and
  how much was requested.
- `TransferToZeroAddress` carries no fields. The empty braces
  `{}` are required — they distinguish the error type from a
  possibly-incomplete declaration. (Writing `error
  TransferToZeroAddress;` without braces is a syntax error.)
- `Frozen` carries one `u64` field. Useful for "when did this
  state change?" reasoning.

The shape of the value is fixed at declaration. You cannot revert
with `InsufficientBalance` and leave a field unset; the language
requires every field to be specified at the call site.

## Scope: where errors live

Errors can be declared in two places:

**Inside a contract**, as in the example above. The error is
scoped to that contract — the name `InsufficientBalance` declared
inside `Token` is *not* the same type as `InsufficientBalance`
declared inside another contract, even if their fields match.
Production code overwhelmingly uses this form.

**At the top of a file**, outside any `contract` block. The
error is then visible to every contract declared in the same file.
Useful when several contracts in one file share an error shape:

```otigen
error Unauthorized { caller: Address }
error PausedAction {}

contract Treasury { /* uses both */ }
contract Vault    { /* uses both */ }
```

There is no third form: errors declared in one file are not
visible from another. If you want a shared error type across
multiple files, put the declaration in a module that both files
`use`.

## Why typed errors

Solidity-style `require(cond, "INSUFFICIENT_BALANCE")` string
errors are convenient to write but lossy to consume. The string is
opaque bytes; tooling has to *parse* it to figure out the failure
mode, and any field values (the actual balance, the amount
requested) have to be either omitted or smuggled into the message
text.

Typed errors solve this. The revert data is the *struct*: the
caller sees `InsufficientBalance { available: 100, required: 200 }`
directly, with its fields decoded. Indexers can group failures by
type, dashboards can render the parameters, and a calling contract
can pattern-match on the failure to decide what to do next.

The cost is one line of code: you declare the type once, then
use it forever.

## Naming conventions

Error names use `UpperCamelCase`, like struct names. The convention
that reads well: name the error for the *condition that failed*,
not for the action that triggered it. `InsufficientBalance` is
better than `TransferFailed`; the former tells you *why*, the
latter tells you *which call*. The call site is recoverable from
the stack trace; the *reason* needs to be in the error.

If you have lots of small variations on a theme, group them by
prefix: `FrozenAccount {}`, `FrozenContract {}`, `FrozenMarket {
market_id: u64 }`. The shared prefix makes them easy to scan.

## Field choices

Two patterns are worth calling out for field design.

**Carry the values that caused the failure**, not just the
condition. `InsufficientBalance { available, required }` is more
useful than `InsufficientBalance {}`, because the caller can render
a precise message ("you have 100, needed 200") and a monitoring
system can group failures by *severity* of the gap.

**Carry an identifier that lets the caller look up more state.**
If the failure is per-position, include the position id:
`PositionExpired { position_id: u64 }`. The caller can then read
the full position record themselves if they need more context.
The error itself stays compact.

Don't carry sensitive data in errors. Revert payloads are public
on-chain bytes; anything that goes into an error is going into the
transaction receipt and from there into block explorers. If the
condition involves something that shouldn't be public, surface a
generic error and log the details privately off-chain (or not at
all).

## Errors and the ABI

A `pub` contract's ABI includes every error type the contract may
revert with, in the same format as event types: name, field names,
field types. We'll cover the JSON ABI format in
[Chapter 14](ch14-02-json-schema.md); the point for now is that
errors are *first-class ABI citizens*, on the same level as
events. Downstream tooling sees them and can render the right
form for each.

## Summary

An `error` is a struct-shaped type that lives in revert data.
Declare with `error Name { field: Type, ... }`; declare with
empty braces `{}` if there are no fields. Errors are scoped to
their contract (or the file, when declared at the top level).
Typed errors carry structured failure information that downstream
tooling can render and reason about; prefer them over string
messages everywhere production code is involved.

The [next section](ch06-02-require-revert.md) covers the two
macros that actually *raise* an error.
