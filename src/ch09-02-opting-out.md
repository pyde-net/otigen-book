# Opting out

You opt out of the auto-guard with `#[reentrant]`. We covered the
mechanics in [Chapter 8.4](ch08-04-reentrant.md). This section is
about *what to do instead* — the check-effects-interactions
discipline that becomes your responsibility once you've turned
the guard off.

## The check-effects-interactions order

The single rule that protects every `#[reentrant]` function is:

1. **Check** every precondition (`require!` blocks).
2. **Effect** every state change.
3. **Interact** with external contracts last.

The pattern works because, by the time you make the external
call, the contract is *already in its post-call state*. A
re-entering attacker calling back into the function sees the
state they would have seen at the *end* of the previous call,
not the *beginning*.

Concretely:

```otigen
contract Vault {
    storage {
        balances: Map<Address, u256>,
    }

    error InsufficientBalance { available: u256, required: u256 }

    #[reentrant]
    pub fn withdraw(amount: u256) {
        // 1. Check
        let bal = self.balances[msg.sender];
        require!(bal >= amount, InsufficientBalance {
            available: bal, required: amount,
        });

        // 2. Effect — write before the external call
        self.balances[msg.sender] = bal - amount;

        // 3. Interact — only now do the external call
        raw_call!(
            target: msg.sender,
            calldata: b"",
            gas: 5_000,
            value: amount,
        );
    }
}
```

If a malicious recipient re-enters `withdraw` from the value
transfer in step 3, the second entry's step 1 reads the *already-
decremented* balance. The `require!` fails on insufficient
balance, the re-entry call reverts, and the outer call completes
cleanly with the funds dispatched and the balance correct.

## The wrong order

The DAO bug is precisely the wrong order — interact before
effect:

```otigen
#[reentrant]
pub fn buggy_withdraw(amount: u256) {
    // 1. Check
    let bal = self.balances[msg.sender];
    require!(bal >= amount, InsufficientBalance {
        available: bal, required: amount,
    });

    // 2. Interact — BEFORE the state change
    raw_call!(
        target: msg.sender,
        calldata: b"",
        gas: 5_000,
        value: amount,
    );

    // 3. Effect — too late
    self.balances[msg.sender] = bal - amount;
}
```

The recipient's re-entry sees the *original* balance, withdraws
again, sees the original balance still, withdraws again, and so on
until the contract is empty. This is exactly the bug class.

## When the discipline isn't enough

Check-effects-interactions handles the *direct* re-entry case. It
doesn't handle two subtler patterns:

**Cross-function reentrancy via a different unguarded function.**
If your contract has *two* `#[reentrant]` functions and they
share state, the re-entry could come into the *other* function:

```otigen
#[reentrant]
pub fn buy(amount: u256) {
    require!(self.balances[msg.sender] >= amount * self.price, …);
    self.balances[msg.sender] -= amount * self.price;
    // Interact:
    raw_call!(target: msg.sender, calldata: callback_data, ...);
}

#[reentrant]
pub fn sell(amount: u256) {
    require!(self.holdings[msg.sender] >= amount, …);
    self.holdings[msg.sender] -= amount;
    let payout = amount * self.price;
    self.balances[msg.sender] += payout;
    // Interact:
    raw_call!(target: msg.sender, ...);
}
```

A re-entry from `buy`'s external call into `sell` can move
holdings → balances → escape, in a window where the contract's
*invariant* (total balance = total holdings × price) is broken.

The fix: don't share invariants across `#[reentrant]` functions.
If two functions both touch the same balance, one of them should
own it.

**Read-only reentrancy.** Even with the guard, an *unguarded*
`#[view]` function reading state during the locked window sees
the *mid-execution* state, not the resting state. If another
contract is using your view as an oracle, it sees stale data and
makes wrong decisions.

This pattern is so consequential it gets its own section:
[Chapter 9.3 — Cross-contract reentrancy](ch09-03-cross-contract.md).

## Tests for `#[reentrant]` functions

Every function you mark `#[reentrant]` should have an explicit
test that simulates a re-entering attacker. The structure of the
test is consistent enough that it's worth memorising:

```otigen
contract MaliciousReentrant {
    storage {
        target: Address,
        depth: u64,
    }

    #[constructor]
    pub fn init(target: Address) {
        self.target = target;
    }

    #[receive]
    #[payable]
    pub fn on_value() {
        // Try to re-enter the target.
        if self.depth < 5 {
            self.depth = self.depth + 1;
            Interface::at(self.target).withdraw(100);
        }
    }
}

#[test]
fn reentrant_attacker_cannot_drain() {
    let vault = deploy!(Vault);
    let attacker = deploy!(MaliciousReentrant, address(vault));

    // Set up the attacker with some balance in the vault.
    Interface::at(vault).deposit{value: 200}();

    // Attacker withdraws, then their #[receive] tries to re-enter.
    // The second withdraw call should see balance already at 100,
    // so withdrawing another 100 succeeds — but at depth 2 the
    // attacker only has 0 balance left, so the next call reverts.

    let final_balance = address(vault).balance();
    assert!(final_balance == 0);  // attacker got their 200 once, no more
}
```

The pattern is: a malicious contract whose callback re-enters,
and a test that asserts the upper bound on what the attacker can
extract is the *legitimate* amount, not more.

## Summary

Opting out of the guard with `#[reentrant]` means owning the
check-effects-interactions order yourself. Every state change
must precede the external call. Two trickier patterns —
cross-function reentrancy and read-only reentrancy — escape this
discipline; design for them by avoiding shared invariants between
multiple `#[reentrant]` functions and by considering whether your
`#[view]`s are queried as oracles. Test every `#[reentrant]`
function with a simulated attacker.

The [next section](ch09-03-cross-contract.md) covers the
multi-contract case, where the guard cannot help and the
discipline becomes the entire defence.
