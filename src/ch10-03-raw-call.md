# `raw_call!`

`raw_call!` is the low-level cross-contract call macro. Where
`Interface::at(addr).method(args)` gives you a typed,
selector-correct, decoded-return call, `raw_call!` gives you four
arguments — *target, calldata, gas, value* — and returns
`(success: bool, return_data: bytes)`. You're encoding the
calldata yourself and you're getting back raw bytes.

You reach for `raw_call!` when you need something `Interface::at`
can't give you: handling a revert without bubbling, dispatching a
call whose selector or arguments aren't known at compile time, or
implementing a proxy that forwards arbitrary calldata.

## The macro shape

```otigen
let (ok, ret) = raw_call!(
    target: addr,
    calldata: data,
    gas: 100_000,
    value: 0,
);
```

The four named arguments:

- **`target`** — the `Address` to call.
- **`calldata`** — the `bytes` to send. The first four bytes are
  conventionally the selector; everything after is ABI-encoded
  arguments.
- **`gas`** — the maximum gas (`u64`) the callee can consume. Use
  `gas_remaining()` for "as much as I have left".
- **`value`** — the native PYDE (`u256`) attached to the call.
  Zero for non-payable targets.

The return is always `(bool, bytes)`:

- `ok` is `true` if the callee succeeded, `false` if it reverted.
- `ret` is the bytes the callee returned (on success) or the
  revert payload (on failure).

## Handling a revert without bubbling

This is the canonical use case. A typed `Interface::at` call
re-raises the callee's revert in your function; `raw_call!` does
not. You see `ok == false` and can decide what to do.

```otigen
pub fn try_charge(target: Address, amount: u256) -> bool {
    let calldata = encode_charge(amount);  // pseudo-helper
    let (ok, _) = raw_call!(
        target: target,
        calldata: calldata,
        gas: 100_000,
        value: 0,
    );

    if !ok {
        // Soft-fail: caller asked for a charge, charge didn't go
        // through, but we don't want to revert the whole transaction.
        emit ChargeAttemptFailed { target: target, amount: amount };
        return false;
    }

    return true;
}
```

The soft-fail pattern is the most common reason to use
`raw_call!`. Most other reasons are corner cases.

## Forwarding arbitrary calldata

A proxy or forwarder receives an arbitrary call, doesn't know
which method it implements, and just re-sends the calldata to
some other contract.

```otigen
#[fallback]
pub fn forward() {
    let (ok, ret) = raw_call!(
        target: self.implementation,
        calldata: msg.data,
        gas: gas_remaining(),
        value: msg.value,
    );
    require!(ok, ForwardFailed {});
    // The caller wanted whatever bytes the impl returned;
    // we pass them through. (Returning bytes from a fallback
    // is supported.)
}
```

The fallback uses `msg.data` as the calldata, forwards
`msg.value` as the value, and re-raises a revert from the
implementation as its own revert.

## Calling a method whose name is decided at runtime

If the contract decides *at runtime* which method to call (a
dispatcher, a pluggable routing table), the calldata's selector
isn't known to the compiler. `raw_call!` is the only way:

```otigen
storage {
    routes: Map<u64, (Address, u32)>,  // route id -> (target, selector)
}

pub fn route(route_id: u64, payload: bytes) {
    let (target, selector) = self.routes[route_id];

    // Build calldata: selector || payload
    let calldata = concat_selector(selector, payload);

    let (ok, _) = raw_call!(
        target: target,
        calldata: calldata,
        gas: gas_remaining(),
        value: 0,
    );
    require!(ok, RouteFailed { route_id: route_id });
}
```

This pattern is unusual. Most contracts know at compile time
exactly which methods they call on which targets, and use
`Interface::at`. The routes pattern shows up in upgradable
contracts, plugin systems, and similar designs.

## Sending native value with no calldata

A bare value transfer — what Solidity calls `.transfer(amount)` —
is `raw_call!` with empty calldata and a non-zero value:

```otigen
raw_call!(
    target: recipient,
    calldata: b"",
    gas: 5_000,
    value: amount,
);
```

The recipient is treated as receiving a bare value transfer. If
they're a contract with a `#[receive]` function, that runs; if
they're an EOA or a contract without `#[receive]`, the value is
credited to their balance and the call returns success.

The small gas (`5_000`) is the conventional limit for "just send
value"; a `#[receive]` callback that needs more than this should
declare so explicitly, or you should send through a different
path.

## When *not* to use `raw_call!`

A few cases where `raw_call!` is a worse choice than the typed
form:

**You know the callee's interface.** Use `Interface::at`. The
typed form is shorter, type-checked, and decodes the return value
for you. `raw_call!` is for cases where you genuinely can't be
typed.

**You want the callee's revert to propagate.** Use `Interface::at`
— it propagates by default. With `raw_call!` you have to write
`require!(ok, …)` yourself, and you can lose the typed error
along the way.

**You want a compile-time check on the call shape.** `raw_call!`
takes bytes; the compiler can't tell whether your bytes have the
right selector or argument encoding. If you're calling a contract
you control, typed is better.

## Gas accounting

The `gas:` parameter is the *maximum* the callee can use, not a
reservation. If the callee uses less, you get the unused gas
back. If the callee tries to use more, the runtime reverts the
sub-call.

A common pattern: bound the callee's gas at a conservative limit
so that even a malicious callee can't consume your entire
remaining budget. `gas: 100_000` is a reasonable starting point
for "I'm sending value to a contract I don't fully trust".

`gas_remaining()` is the maximum you can pass — you can't allocate
more gas than your function has left.

## ABI encoding by hand

The `calldata: bytes` argument is the part `raw_call!` makes you
do yourself. The encoding rules are the same as in the JSON ABI:

- First four bytes: the function selector.
- After the selector: arguments, padded and packed per the ABI
  encoding.

For simple cases, you can build calldata with helper functions in
the standard library:

```otigen
use std::abi;

let calldata = abi::encode_with_selector(
    0xa9059cbb,            // transfer(address,uint256) selector
    (recipient, amount),
);
```

We won't cover the encoding rules in detail in this section — the
[ABI chapter](ch14-00-abi.md) does that — but the helper exists
when you need to roll your own.

## Summary

`raw_call!` is the low-level cross-contract call. You provide
target, calldata, gas, and value; you get back `(ok, return_data)`
with no automatic revert propagation. Use it for soft-failure
handling, arbitrary forwarding, and runtime-dispatched calls.
For known-shape calls, `Interface::at` is the better choice
everywhere.

The [next section](ch10-04-deploy.md) covers `deploy!`, the
fourth cross-contract mechanism — and the only one that creates
a new contract rather than calling an existing one.
