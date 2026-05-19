# Cross-contract reentrancy

The auto-guard protects you from a contract re-entering itself.
It does not protect you from a contract re-entering a *different*
contract whose state you depend on. This section is about the
attack shapes the guard cannot see, and the defensive patterns
that handle them.

## Read-only reentrancy

This is the most common cross-contract pattern, and it bites
sober contracts that "did everything right" with respect to the
DAO-style attack.

The setup: contract A's `#[view]` function reads from contract B's
state. While A is *executing* (specifically, while inside the
locked window of a guarded function), B's state is mid-update —
some writes have happened, some haven't. Any other contract that
queries A's view during this window sees a value that's
*inconsistent with B's resting state*.

Concretely:

```otigen
contract LiquidityPool {
    storage {
        token_balance: u256,
        share_balance: u256,
    }

    #[view]
    pub fn share_price() -> u256 {
        // price-per-share = total tokens / total shares
        return self.token_balance / self.share_balance;
    }

    #[reentrant]
    pub fn add_liquidity(amount: u256) {
        // 1. Check
        require!(amount > 0, ZeroAmount {});

        // 2. Effect (partial)
        self.token_balance = self.token_balance + amount;

        // 3. Interact: pull the user's tokens.
        Interface::at(self.token_address).transfer_from(
            msg.sender, address(self), amount
        );

        // 4. Effect (rest)
        let shares_to_mint = amount * self.share_balance / self.token_balance;
        self.share_balance = self.share_balance + shares_to_mint;
    }
}
```

The bug: in the window between step 2 and step 4, `token_balance`
has been incremented but `share_balance` hasn't. A different
contract calling `share_price()` during that window sees an
*inflated* token-per-share number — and trades against it.

The auto-guard on `add_liquidity` does not help, because the
re-entry isn't *into* `add_liquidity`. It's into `share_price`,
which is `#[view]` and therefore unguarded.

The fix: do all the storage writes that affect the invariant
*before* the external call.

```otigen
#[reentrant]
pub fn add_liquidity(amount: u256) {
    require!(amount > 0, ZeroAmount {});

    // Compute the new totals before any external call.
    let new_token_balance = self.token_balance + amount;
    let shares_to_mint = amount * self.share_balance / self.token_balance;

    // Effect — write both before the external call.
    self.token_balance = new_token_balance;
    self.share_balance = self.share_balance + shares_to_mint;

    // Interact: now safe to call out.
    Interface::at(self.token_address).transfer_from(
        msg.sender, address(self), amount
    );
}
```

Now the invariant holds throughout; any view query during the
external call sees a consistent state.

The general principle: any state that *another contract uses as
input* should be consistent at every point where control may
leave this contract. "When control leaves" means: every external
call site.

## Multi-contract attack chains

The other major cross-contract pattern is the multi-hop chain.
The attack doesn't need to re-enter the contract that started
it; it can use the call window to manipulate state in a
*third* contract.

```text
User → A → B (modifies state)
            → A (re-enters A; A's guard is set, refuses)
            → C (uses A's stale-during-its-locked-window state)
```

The guard on A stops the re-entry into A. But C, called from
within B's execution, may read A's *mid-call* state via a view
function, and act on it. The contract that gets defrauded is
C — but the only contract that's strictly "wrong" is A, for
having a state-inconsistent window.

The defence is the same as for read-only reentrancy: keep the
contract's externally-observable state consistent across every
external call site. If you make a call out, the world that's
about to read your state must see the post-call state.

## ERC-777 and "safe" callbacks

Some token standards (notably ERC-777 on Ethereum) call into the
sender and receiver during a transfer — a "hook" that lets
contracts react to incoming tokens. The intent is helpful (a
contract can register interest in a particular kind of incoming
transfer), but the side effect is that a transfer involves an
external call to *both ends* of the transfer.

If your contract's logic depends on the token transferring
atomically *before* anything else happens, an ERC-777-style hook
breaks that assumption. The receiver's hook can re-enter your
contract before the transfer settles in the token contract's
storage.

The defence: assume every token transfer hands control to the
counterparty. Treat the transfer call as an `Interact` step in
the CEI ordering, and don't do anything that depends on the
transfer's success until after the call returns. If your
contract trusts a *specific* token contract not to do this (your
own), you can rely on its behaviour — but never extend that
trust to a *third-party* token your users can specify.

## Defensive patterns

A few patterns that consistently hold up.

**Don't share writeable state between functions that both make
external calls.** If `withdraw` and `swap` both touch
`self.reserves`, they're both candidates for cross-function
reentrancy. Refactor so one function owns the slot.

**Use a check-against-snapshot.** Before an external call, take a
local copy of the storage values you care about. After the call,
compare. If the post-call value differs from the snapshot in a
way that's inconsistent with what you just did, revert.

```otigen
#[reentrant]
pub fn swap(in_amount: u256) {
    let pre_reserves = self.reserves;
    // ... external call ...
    let post_reserves = self.reserves;
    require!(post_reserves == pre_reserves - expected_change, ReservesMutated {});
    // ... continue ...
}
```

This is heavy-handed but bulletproof: any external call that
mutated the reserves trips the check, and the transaction
unwinds.

**Verify the assumption you make about the callee.** If you call
a contract you didn't deploy, you don't know what it does. Use
the snapshot-check pattern, or call into a *known-safe* variant
of the token contract that you control.

## Where the guard does help

The auto-guard handles cleanly:

- Direct re-entry into the same function (DAO style).
- Re-entry into another guarded function on the same contract.
- Re-entry into a guarded function while a different guarded
  function is on the stack.

That covers the dumb attacks. The smart attacks need the patterns
in this section.

## Summary

The auto-guard sees only one contract's lock; cross-contract
reentrancy is invisible to it. The two attack shapes are
read-only reentrancy (a `#[view]` reads mid-call state) and
multi-hop chains (a different contract reads mid-call state).
Both have the same defence: make your storage consistent at
every point where control may leave your contract. Use the
check-effects-interactions ordering, take snapshots before
external calls, and assume any token transfer may call back into
you.

That's the end of the reentrancy chapter. The
[next chapter](ch10-00-cross-contract.md) shifts from defence to
infrastructure: how Otigen contracts call other contracts in the
first place.
