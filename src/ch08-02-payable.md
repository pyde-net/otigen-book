# `#[payable]` and `msg.value`

A `#[payable]` function is one that can receive native PYDE in
the call that invokes it. Without the attribute, any attempt to
attach value to a call reverts before the function runs, and
inside the function body `msg.value` is unavailable to read.

## Declaring a payable function

```otigen
#[payable]
pub fn deposit() {
    let amount = msg.value;
    self.balances[msg.sender] = self.balances[msg.sender] + amount;
    emit Deposited { who: msg.sender, amount: amount };
}
```

The semantics:

- The caller can attach native PYDE to the call (we'll see the
  caller-side syntax in [Chapter 10](ch10-02-interface-at.md)).
- Inside the function, `msg.value` is the number of PYDE quanta
  attached (a `u256`). For non-payable functions, *reading*
  `msg.value` is a compile error — not just `msg.value > 0` checks,
  but any read.
- The native PYDE is credited to the contract's own balance
  *before* the function body runs. If the body reverts, the
  credit is rolled back along with everything else.

## Reading `msg.value`

`msg.value` is one of the built-in globals from
[Chapter 3](ch03-02-data-types.md). Inside a `#[payable]`
function, it carries the value the caller attached:

```otigen
#[payable]
pub fn pay_for_seat() {
    require!(msg.value >= 100_000_000, InsufficientPayment {
        sent: msg.value,
        required: 100_000_000,
    });
    self.holders[msg.sender] = true;
}
```

`msg.value` is `0` when the caller attached no value — but a
non-payable function would have refused the call before the body
ran, so a non-zero value is the interesting case.

Outside `#[payable]` (and `#[constructor]`), any use of
`msg.value` is a compile error:

```otigen
pub fn not_payable() {
    let v = msg.value;  // <-- compile error
    // ...
}
```

```sh
error: `msg.value` may only be read inside `#[payable]` or `#[constructor]` functions
  --> src/Bad.oti:2:13
   |
 2 |     let v = msg.value;
   |             ^^^^^^^^^ this function is not declared `#[payable]`
```

The error is one of the cases where Otigen makes you state intent
loudly: a function that talks about `msg.value` is one that
expects to receive value, and the attribute is how you say so.

## What `#[payable]` cannot combine with

Two combinations are illegal:

**`#[view]` + `#[payable]`** — a view doesn't mutate state, and
receiving value *is* a state mutation (the contract's balance
changes). The compiler rejects:

```otigen
#[view]
#[payable]
pub fn nope() -> u256 { ... }  // <-- compile error
```

**`#[constructor]` + `#[payable]`** — the constructor receives
its inputs through the deployment call, not through `#[payable]`.
If you want the constructor to *accept value* at deploy time, the
deploy script attaches the value via `deploy!(Contract, args,
value: amount)`, and the constructor reads `msg.value` directly —
the constructor implicitly behaves like a payable function. You do
not mark it `#[payable]` separately.

## Idiomatic patterns

A few patterns that come up in payable functions.

**Refund overpayment.** If a function takes a fixed price, and the
caller may overpay, refund the difference back to them at the end:

```otigen
#[payable]
pub fn buy_seat() {
    require!(msg.value >= 100_000_000, Underpaid {});

    self.holders[msg.sender] = true;
    emit SeatBought { who: msg.sender };

    let refund = msg.value - 100_000_000;
    if refund > 0 {
        // send the difference back. We'll meet the actual transfer
        // mechanism in Chapter 10; the shape is shown here.
        raw_call!(
            target: msg.sender,
            calldata: b"",
            gas: 5_000,
            value: refund,
        );
    }
}
```

**Reject zero value.** If a payable function genuinely *needs* a
non-zero payment, fail fast:

```otigen
#[payable]
pub fn donate() {
    require!(msg.value > 0, ZeroDonation {});
    self.donations[msg.sender] = self.donations[msg.sender] + msg.value;
}
```

A subtle point: a non-zero `require!` is *not* enforced by the
language. The language guarantees only that the caller can attach
value (`#[payable]`) — not that they did. If you want at least one
quantum, ask for it.

**Account for the value in the same write.** If the contract is
tracking deposits, write the new balance *before* doing anything
else with the value:

```otigen
#[payable]
pub fn deposit() {
    self.balances[msg.sender] = self.balances[msg.sender] + msg.value;
    emit Deposited { who: msg.sender, amount: msg.value };
}
```

The runtime has already credited the contract's overall balance;
the contract's *internal* accounting needs to keep up. Forgetting
this is one of the more painful classes of bug in a token-handling
contract.

## What about *sending* value?

A `#[payable]` function declares "this function may *receive*
value". It does not say anything about *sending* value to others.
Sending value to another address is done with `raw_call!(... value:
amount)` or by calling a payable function on another contract
with the value form. We'll cover the call-with-value syntax in
[Chapter 10](ch10-02-interface-at.md).

## ABI representation

The contract's ABI marks each function as payable or not. A
caller's encoding tool (web3 library, RPC client) refuses to attach
value to a non-payable function based on this marker. So the
`#[payable]` attribute serves both as a compile-time gate inside
the contract and a runtime-honoured signal on the way in.

## Summary

`#[payable]` declares a function as eligible to receive native
PYDE. Inside the function, `msg.value` is readable; outside it,
reading `msg.value` is a compile error. The attribute combines
with `pub` and the reentrancy attributes, but conflicts with
`#[view]` (a view can't mutate) and `#[constructor]` (which is
implicitly payable when called with value).

The [next section](ch08-03-constructor.md) covers `#[constructor]`
— the one-shot initialiser that runs at deployment.
