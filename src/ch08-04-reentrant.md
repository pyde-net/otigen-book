# `#[reentrant]`

Every `pub` non-view function is wrapped at compile time with an
automatic reentrancy guard. `#[reentrant]` is the attribute that
removes the guard. Marking a function `#[reentrant]` is a
declaration of intent: "I expect this function to be re-entered,
and I have written it defensively to handle that."

You should almost never need this attribute. The default — guard
on — is the right answer for the overwhelming majority of public
functions. This chapter exists so the rare case where you need
opt-out is documented and clear.

## What the guard does

The auto-inserted guard is conceptually four lines around your
function body:

```text
pub fn deposit() {
    // (auto) require!(reentrancy_lock == 0);
    // (auto) reentrancy_lock = 1;

    // ... your code ...

    // (auto) reentrancy_lock = 0;
}
```

If a transaction enters `deposit`, gets out via a cross-contract
call, and the callee tries to call back into *this* contract
through any guarded function — the guard sees `reentrancy_lock`
set, reverts, and the transaction unwinds. The classic
"transfer-then-call" reentrancy pattern that drained the DAO does
not get past the guard.

The guard occupies a *reserved storage slot* — slot index
`0x3FFFE`, well outside the range the compiler allocates for your
fields (which starts at 0 and grows up). The slot's only purpose
is the lock, and no other code reads or writes it. The cost is one
SSTORE on entry and one on exit per guarded call — fixed,
predictable, and present in every gas estimate.

## Removing the guard

`#[reentrant]` turns the wrapper off:

```otigen
#[reentrant]
pub fn callable_recursively(amount: u256) {
    // no reentrancy guard
    // ...
}
```

That's the entire change. The function still runs; the lock is
just not consulted on entry, not set on entry, and not cleared on
exit. The contract is then responsible for whatever invariants the
guard would have protected.

## When you'd want this

There are two legitimate use cases for `#[reentrant]`. Anything
that isn't one of these is probably a mistake.

### 1. You're intentionally recursive

Some contracts have algorithms that legitimately call themselves
— through a cross-contract hop, because direct recursion would
cost an order-of-magnitude more gas. The classic example is a
batched dispatcher:

```otigen
contract Batch {
    #[reentrant]
    pub fn dispatch(actions: Vec<Action>) {
        for action in actions {
            // Each action may include a call back into this contract
            // to dispatch sub-actions, which then call back into us
            // again. The recursion is intentional and bounded.
            self.execute(action);
        }
    }
}
```

The function explicitly knows it'll be re-entered, and the
"recursion" is part of the design.

### 2. You're composing with a trusted callback

Some patterns hand control to a known callee that will, by
contract, call back into you in a specific way. A common shape is
a "callback in the middle of execution" pattern:

```otigen
contract Bridge {
    #[reentrant]
    pub fn relay_and_complete(payload: bytes) {
        let receiver = ...;  // trusted callee, allow-listed
        Interface::at(receiver).on_relay(payload);
        // The receiver will call back into us via complete_relay,
        // which has its own state checks.
    }
}
```

This shape is unusual and requires *you* to think carefully about
the reentrancy invariants. The compiler isn't going to help.

## When you should *not* use `#[reentrant]`

A few cases where the urge to mark a function `#[reentrant]` is a
red flag:

**You're calling an unknown contract.** If the cross-contract
call you make is to an address the caller can choose (a generic
token transfer to a user-provided address, for example), the guard
is what protects you from a malicious recipient. Removing it
because "the call should be safe" is exactly the assumption that
the DAO hack exploited. Leave the guard on.

**You want to allow a specific re-entry pattern.** "I want my
function to be callable from another function in the same
contract during a cross-call" sometimes looks like a reason to
remove the guard. It's not. Instead, *factor the re-entrant
behaviour into an internal function* — internal functions are not
guarded, because the guard is per-call-frame from outside. Make
the public entry-point thin, do the work in an internal helper,
and let the helper be called freely.

**You're trying to save gas.** The guard costs two SSTOREs, which
is not free, but is not the dominant cost of any realistic
function. Removing it as a gas optimisation will save a few
hundred gas and expose you to a vulnerability class that has
drained nine-figure sums in production. Don't.

## Composing with check-effects-interactions

When you *do* mark a function `#[reentrant]`, the
*check-effects-interactions* discipline becomes mandatory:

1. **Check** preconditions first (`require!` blocks).
2. **Effect** the state change before any external call.
3. **Interact** with external contracts last.

Concretely: if you're transferring funds *out* of the contract,
write the post-transfer balance to storage *before* the call that
moves the value, so that even if the callee calls back in, the
state is already what it should be.

```otigen
#[reentrant]
pub fn withdraw(amount: u256) {
    // Check
    let bal = self.balances[msg.sender];
    require!(bal >= amount, InsufficientBalance {
        available: bal, required: amount,
    });

    // Effect — write before the external call
    self.balances[msg.sender] = bal - amount;

    // Interact — only now do the external call
    raw_call!(
        target: msg.sender,
        calldata: b"",
        gas: 5_000,
        value: amount,
    );
}
```

If a malicious recipient calls back into `withdraw`, the second
entry sees the balance already decremented; the `require!` fails;
the inner call reverts. The outer call continues to its end with
the funds dispatched and the storage in a consistent state.

This is the discipline you've replaced the guard with. The
language no longer enforces it; *you* do.

## Interaction with other attributes

`#[reentrant]` is mutually exclusive with two attributes:

- `#[view]` — a view doesn't mutate, so re-entry is meaningless;
  the guard isn't applied to views anyway.
- `#[constructor]` — the constructor runs once, at deployment;
  re-entry doesn't apply.

It combines fine with `#[payable]`. A `#[reentrant] #[payable]`
function is a payable function whose author has accepted
responsibility for handling reentrancy by other means.

## Summary

The reentrancy guard is on by default for every `pub` non-view
function. `#[reentrant]` turns it off, declaring that the author
has accounted for reentrancy through other means (typically the
check-effects-interactions discipline). Reach for the attribute
only when you genuinely have a pattern that needs re-entry;
removing the guard as an optimisation or because "it should be
safe" is a category of bug that has cost ecosystems hundreds of
millions of dollars. The default is the right answer almost
always.

The [next section](ch08-05-receive-fallback.md) covers the two
attributes for dispatch-corner cases: `#[receive]` and
`#[fallback]`.
