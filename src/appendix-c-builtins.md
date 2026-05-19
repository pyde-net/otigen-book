# Appendix C — Built-in functions and globals

A reference of every value, function, and macro the compiler
makes available to your code without you declaring it.

## Globals

These are values automatically available inside every function
(except where noted):

### `msg.sender` (`Address`)

The address that called this function. For a top-level call
(from an EOA), this is the EOA. For a cross-contract call,
this is the calling contract.

### `msg.value` (`u256`)

The native PYDE quanta attached to this call. **Only readable
inside `#[payable]` and `#[constructor]` functions.** Reading
`msg.value` in any other function is a compile error.

### `msg.data` (`bytes`)

The raw calldata bytes the caller sent — selector and
arguments. Useful in `#[fallback]` functions that forward calls.

### `block.height` (`u64`)

The wave-commit index of the block this transaction is in.
Useful for time-locked actions, vesting schedules.

### `block.timestamp` (`u64`)

The block's commit time in Unix seconds. Set by consensus, so
deterministic and replay-safe.

### `block.anchor` (`Address`)

The address of the anchor committee member that proposed the
current wave-commit block. (Solidity's `block.coinbase` /
`block.miner` analog.)

### `tx.gas_price` (`u256`)

The base fee at submission, in PYDE quanta per gas unit.

### `tx.nonce` (`u64`)

The sender's account nonce — incremented per transaction.

### `tx.hash` (`u256`)

The hash of the current transaction. Useful for events that
need to reference the originating tx.

### `tx.gas_limit` (`u64`)

The gas limit the sender attached to the transaction.

### `address(self)` (`Address`)

The current contract's own address. Inside any of the
contract's functions, `address(self)` returns the contract's
on-chain address.

### `gas_remaining()` (`u64`)

A built-in function (not a global) that returns the gas left
in the current execution context. Useful when calling
external contracts with a bounded gas budget.

### `Address::ZERO` (`Address`)

The canonical zero-address sentinel — all 32 bytes set to
`0x00`. Used as the "no address" placeholder in many idioms
(burn-to-zero patterns, freshly-allocated fields).

## Macros

These are built-in callable constructs invoked with `!`. The
parser recognises them specially; you cannot define your own
macros.

### `require!(cond, ErrorValue)`

If `cond` is `false`, revert the transaction with `ErrorValue`
as the revert payload. `ErrorValue` must be a struct-literal
expression: `ErrorName { field: value, ... }` or
`ErrorName {}` for an error with no fields. See
[Chapter 6.2](ch06-02-require-revert.md).

### `revert!(ErrorValue)`

Unconditional revert with `ErrorValue`. Same constraints on
the argument shape as `require!`.

### `assert!(cond)`

If `cond` is `false`, revert with the system error
`AssertionFailed`. No fields, no typed payload. Use for
internal invariants and tests; prefer `require!` with a typed
error for user-facing failures.

### `emit EventName { field: value, ... }`

`emit` is a *statement* keyword, not a function call (note the
absence of `!`). Writes a typed event to the transaction
receipt. The shape must match an `event` declaration in scope.
Cannot be used inside a `#[view]` function. See
[Chapter 7](ch07-00-events.md).

### `hash(args...)`

Variadic Poseidon2 hash. Takes any number of arguments and
returns a `u256` hash output. The arguments are concatenated
(in declaration-order bytes) before hashing.

### `deploy!(Contract, args, [value: amount])`

Deploys a contract from inside the current function. Returns
a typed `Contract<T>` handle. See
[Chapter 10.4](ch10-04-deploy.md).

### `raw_call!(target: addr, calldata: data, gas: g, value: v)`

Low-level cross-contract call. Returns `(success: bool,
return_data: bytes)`. See
[Chapter 10.3](ch10-03-raw-call.md).

### `cross_call!(target: "addr", method: "name", args: (...), callback: "fn")`

Async cross-chain message macro. **Parsed at compile time;
runtime semantics not yet wired in.** Once the parachain layer
ships, this is the mechanism for sending messages across
chains; for now, treat it as a reserved future feature.

## Type-associated values

A few values are accessed through a type-name `::` syntax
rather than as bare names:

### `Address::ZERO`

The zero-address sentinel, mentioned above. The form
`Address::ZERO` is the official way to obtain it; there's no
`zero_address()` function.

### Numeric types: no `::MAX` or `::MIN` constants

Otigen does *not* expose `u64::MAX` or `i32::MIN` as
language-level constants. If you need a max value, write
the literal or derive it (`(1u128 << 64) - 1` for `u64::MAX`).

### `Vec::new()`

Creates an empty `Vec<T>`. The element type is inferred from
the binding site.

## Type-level constructors

For the typed-handle constructors (`Interface::at(addr)`,
`Contract::at(addr)`), the path syntax is the same: the
qualifier (the interface or contract name) is the type, and
`::at(addr)` is the constructor.

See [Chapter 10.2](ch10-02-interface-at.md) for the full
treatment.
