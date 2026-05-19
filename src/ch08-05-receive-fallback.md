# `#[receive]` and `#[fallback]`

Two attributes handle dispatch corner cases: the call that
attaches value but no calldata (`#[receive]`), and the call whose
selector doesn't match any of the contract's functions
(`#[fallback]`). Most contracts have neither attribute; they're
features you reach for when you're writing a proxy, a forwarder,
or a contract that's deliberately designed to accept "anything".

## `#[receive]`

A `#[receive]` function is the one the runtime calls when the
contract receives a bare value transfer — calldata is empty, and
the call carries native PYDE.

```otigen
contract Vault {
    storage {
        deposits: Map<Address, u256>,
    }

    #[receive]
    #[payable]
    pub fn on_value() {
        self.deposits[msg.sender] = self.deposits[msg.sender] + msg.value;
    }
}
```

Constraints on the declaration:

- Must be `pub`.
- Must carry `#[payable]` (a receive that didn't accept value
  would be pointless).
- Must take *no parameters*.
- Must *not* have a return type.
- May appear at most once per contract.

Inside the body you can do anything a payable function would do:
read storage, write storage, emit events, call other contracts.
The `msg.value` you read is the value attached to the bare
transfer.

### When you'd want this

The pattern is most common in deposit-style contracts where the
user-facing API is "just send PYDE here":

```otigen
#[receive]
#[payable]
pub fn on_value() {
    require!(self.is_open, NotAcceptingDeposits {});
    self.deposits[msg.sender] = self.deposits[msg.sender] + msg.value;
    emit Deposited { who: msg.sender, amount: msg.value };
}
```

Wallets that "send PYDE to this address" — without specifying a
method — trigger the `#[receive]` function. If the contract
doesn't declare one, a bare value transfer to it reverts.

### When you don't want this

The opposite of "this contract accepts any deposit" is "this
contract should never get random PYDE". For those, omit
`#[receive]` entirely. Any caller sending value without a
matching function will see their transaction revert, and your
contract's balance won't accumulate stray funds.

For most token, governance, and DEX contracts, omitting
`#[receive]` is the right choice. They have specific deposit
methods (`deposit`, `provide_liquidity`, `vote_with_payment`) that
the caller invokes by name.

## `#[fallback]`

A `#[fallback]` function is the one the runtime calls when the
caller sent calldata whose first four bytes (the selector) don't
match any function's selector.

```otigen
contract Proxy {
    storage {
        implementation: Address,
    }

    #[fallback]
    pub fn forward() {
        // Forward the call to the current implementation
        let (ok, ret) = raw_call!(
            target: self.implementation,
            calldata: msg.data,
            gas: gas_remaining(),
            value: msg.value,
        );
        require!(ok, ForwardFailed {});
    }
}
```

Constraints on the declaration:

- Must be `pub`.
- Must take *no parameters*.
- Must *not* have a return type.
- May be `#[payable]` (if you want to allow the fallback to be
  called with value).
- May appear at most once per contract.

Inside the body the function has access to `msg.data` (the raw
calldata), `msg.sender`, and `msg.value` (only if marked
`#[payable]`).

### When you'd want this

Three patterns dominate.

**Transparent proxies.** A proxy contract holds a reference to an
implementation contract and forwards every call to it. The
fallback receives the call, copies the calldata, and re-emits it
to the implementation:

```otigen
#[fallback]
pub fn forward() {
    let (ok, _) = raw_call!(
        target: self.implementation,
        calldata: msg.data,
        gas: gas_remaining(),
        value: 0,
    );
    require!(ok, ImplementationReverted {});
}
```

A user interacting with the proxy *thinks* they're calling the
implementation directly. We'll see proxy patterns more carefully
in [Chapter 10](ch10-03-raw-call.md).

**Forwarders.** Same shape as a proxy, but the target is
configurable per call (typically derived from the calldata, or
from a routing table).

**Catch-all loggers.** A debugging-purpose fallback that logs every
unrecognised call before reverting:

```otigen
#[fallback]
pub fn log_unknown_call() {
    emit UnknownCall { caller: msg.sender, data: msg.data };
    revert!(UnknownSelector {});
}
```

### When you don't want this

Most contracts don't need a fallback. Without one, any call whose
selector doesn't match a function simply reverts — which is what
you want for a well-typed contract. Adding a fallback is a
deliberate choice that says "I'm going to handle the unknown".

## Combining `#[receive]` and `#[fallback]`

A contract can have both. The runtime dispatches in this order
when a call arrives:

1. If calldata is empty and value is non-zero, route to
   `#[receive]` if it exists; otherwise revert.
2. If the calldata's selector matches a regular function, route
   to that function.
3. If the selector doesn't match, route to `#[fallback]` if it
   exists; otherwise revert.

So a contract with both attributes handles every entry shape: bare
value transfer → receive, named call → regular, unknown selector
→ fallback.

## ABI representation

`#[receive]` and `#[fallback]` appear in the ABI as special
entries — they have no selector (the dispatcher uses their
attribute, not a hash) and are tagged with their role. Tools that
generate clients use the entries to know that "send this address
PYDE with no calldata" is a supported operation, separate from
the named methods.

## Summary

`#[receive]` handles bare value transfers (empty calldata, non-zero
value). `#[fallback]` handles calls with unknown selectors. Each
appears at most once per contract; both are optional, both are
specialised, and most contracts have neither. Use `#[receive]` for
deposit-style "send PYDE here" patterns; use `#[fallback]` for
proxies, forwarders, and catch-all dispatch.

That's the end of the function-attributes chapter. The
[next chapter](ch09-00-reentrancy.md) goes deeper into the
single most important safety feature we touched on in this one:
the automatic reentrancy guard.
