# Decoding revert data

When an Otigen contract reverts, the runtime carries a *revert
payload* back to the caller. For a transaction that originates
from an external client, the payload lands in the transaction
receipt; for a cross-contract call, it's the bytes the caller gets
back from `raw_call!` (or the value `Interface::at` re-raises).
This section walks through what's in the payload, how it's
encoded, and how a caller pattern-matches on it.

## What's in the revert payload

A revert payload has three parts:

1. **A four-byte error selector.** Like a function selector, but
   computed over the error name (`FNV-1a` hash, truncated to 4
   bytes). For example, `InsufficientBalance`'s selector might be
   `0xa1b2c3d4`. The selector identifies *which* error type was
   raised.

2. **The fields, in declaration order**, ABI-encoded. For
   `InsufficientBalance { available: u256, required: u256 }`,
   that's 32 bytes of `available` followed by 32 bytes of
   `required`. For variable-size fields (strings, vectors), the
   encoding includes a length prefix and the data.

3. *(Nothing else.)* The total payload is exactly `4 + sum(field
   sizes)` bytes. No padding, no marker, no version field.

For a zero-field error (`error MarketClosed {}`), the payload is
just the four selector bytes — six bytes total counting any framing
the receipt adds.

## Reading the payload from a script

The most common consumer of a revert payload is a deployment or
maintenance script. Otigen's `pyde-dev` script runner decodes
known errors automatically. A script that calls a contract method
and catches the revert sees the typed error directly:

<span class="filename">Filename: script/Probe.oti</span>

```otigen
use my_project::Token;

contract Probe {
    pub fn run() {
        let token = Token::at(0xDEAD…CAFE as Address);

        // Try a transfer that we expect to fail:
        let (ok, data) = raw_call!(
            target: address(token),
            calldata: encode_transfer(0xBEEF…BEEF as Address, 1_000_000_000),
            gas: 100_000,
            value: 0,
        );

        if !ok {
            // `data` holds the revert payload — selector + fields.
            // The script runner exposes a decoder for known errors.
            decode_error(data);  // pseudo-call; see appendix F
        }
    }
}
```

The exact tooling around `decode_error` is part of the testing
and scripting ergonomics; we cover it in
[Appendix F](appendix-f-tooling.md). The point for the language
chapter is that the payload *is* decodable, because the encoding
is deterministic and the contract's ABI tells you the layout of
every error it can revert with.

## Reading the payload from another contract

A contract that calls another contract and wants to handle the
revert programmatically uses the same encoding rules. The
low-level `raw_call!` macro returns `(success: bool, return_data:
bytes)`. When `success` is `false`, `return_data` *is* the revert
payload — four bytes of selector, then the fields.

```otigen
pub fn try_charge(target: Address, amount: u256) -> bool {
    let (ok, data) = raw_call!(
        target: target,
        calldata: encode_charge(amount),
        gas: 100_000,
        value: 0,
    );

    if !ok {
        // Read the selector to decide what to do.
        let selector = read_u32_be(data, 0);  // first 4 bytes
        if selector == 0xa1b2c3d4 {           // InsufficientBalance
            return false;                       // soft-fail
        }
        // Unknown error: surface to our own caller.
        revert!(ChargeFailed {});
    }
    return true;
}
```

This is the "soft-fail" pattern: an upstream `InsufficientBalance`
becomes a `false` return from `try_charge`, while any other revert
bubbles up. Most contracts won't need this; reach for it only
when you genuinely have a *different recovery path* for specific
upstream failures.

A typed alternative exists too. The `Interface::at` form
re-raises a typed revert by default — if you don't want
soft-fail, you just write `Interface::at(target).charge(amount)`
and let an upstream `InsufficientBalance` propagate. We'll cover
the choice between typed-and-bubble vs. raw-and-handle in
[Chapter 10](ch10-03-raw-call.md).

## Selector collisions

Two different error types can in principle hash to the same
four-byte selector. The collision probability for 4-byte FNV-1a
across the few-hundred-errors a project might declare is
negligible — you would have to deliberately engineer it — but if
you ever see two errors with the same selector in your ABI, the
compiler will warn at build time and you should rename one of
them.

The constraint applies *within a contract*: the contract's own
errors must have distinct selectors. Across contracts, collisions
are fine because the runtime knows which contract produced the
revert (the call frame keeps track), and the caller decoding the
revert is using the *callee's* ABI to interpret the selector.

## A note on receipts vs. cross-call returns

When a transaction *fails at the top level* (the call originating
from an external account, not from another contract), the revert
payload lands in the transaction *receipt*. Block explorers and
indexers read the receipt and decode the error against the
contract's ABI for human display.

When a transaction *catches the failure* inside the contract (the
soft-fail pattern), the payload never reaches the receipt. The
transaction commits successfully, the receipt records success,
and only the contract's own internal state reflects the failed
attempt. This is the right model for retry-loops, fallback
patterns, and any case where the failure is "expected" at the
language level — but it does mean off-chain observers don't see
the upstream error unless you emit it as an event.

If you do want a record of the soft-failure, emit one:

```otigen
event ChargeAttemptFailed {
    #[indexed]
    target: Address,
    selector: u32,
}

if !ok {
    let selector = read_u32_be(data, 0);
    emit ChargeAttemptFailed { target: target, selector: selector };
    return false;
}
```

Now the indexer can count attempted charges that failed without
the contract itself reverting.

## Summary

Revert payloads are deterministic: four bytes of error selector
followed by the fields, in declaration order. The selector is an
FNV-1a hash of the error name (truncated to four bytes). Receipts
carry the payload for top-level failures; cross-contract callers
read the same payload via `raw_call!`'s `return_data` and can
decide whether to handle, ignore, or re-raise. Soft-failures
don't appear in receipts unless the contract explicitly emits an
event recording the attempt.

That's the end of the errors chapter. The [next
chapter](ch07-00-events.md) is the other side of the
contract↔world conversation: events.
