# The auto-guard

Every `pub` non-view function in an Otigen contract is wrapped at
compile time with a *reentrancy guard*. The guard is the language's
default protection against the most common form of reentrancy
attack — the one that drained the DAO. This section explains how
it works, what it costs, and what it actually buys you.

## The attack the guard prevents

The original DAO exploit was elegant in its simplicity. A
withdrawal function followed this rough shape:

```text
pub fn withdraw() {
    let bal = self.balances[msg.sender];
    require!(bal > 0, …);

    // Step 1: send the value to the user.
    send(msg.sender, bal);

    // Step 2: zero out the balance.
    self.balances[msg.sender] = 0;
}
```

The bug: the `send` call hands control to the user. If the user is
a *malicious contract*, that contract can use the brief window
before step 2 to call back into `withdraw`. The second `withdraw`
sees the same non-zero balance, sends the same amount again, and
the contract is bled dry one re-entrancy hop at a time.

The fix is *check-effects-interactions*: do the storage write
*before* the external call. The auto-guard is a separate, simpler
fix: just refuse to let the function be re-entered at all.

## The mechanism

The compiler inserts four operations around every guarded
function's body. Conceptually:

```text
pub fn deposit() {
    // (1) Read the lock from storage slot 0x3FFFE.
    // (2) require!(lock == 0, ReentrancyDetected {});
    // (3) Write 1 to slot 0x3FFFE.

    // ... user code ...

    // (4) Write 0 back to slot 0x3FFFE.
}
```

The storage slot is `0x3FFFE` — a reserved index far outside the
range the compiler allocates for user-declared fields (which starts
at 0 and grows upward). User code cannot reach this slot through
`self.field` syntax; it's only touched by the guard.

The semantics are exactly what you'd expect: if the function is
entered when the lock is `0`, it succeeds (and sets the lock to
`1` for the duration of the call). If the function is entered when
the lock is `1`, it reverts with a `ReentrancyDetected` error
before any user code runs. On exit — whether normally or via
revert — the lock returns to `0`.

## What the guard sees

The guard sees one contract's perspective: this contract's lock
slot. Concretely, the lock prevents any *guarded function on this
contract* from re-entering while another guarded function on this
contract is already running.

This is enough to defeat the classic single-contract reentrancy.
It is *not* enough to defeat:

- Reentrancy through a *different* function on the same contract
  (cross-function reentrancy). The guard sees the same lock for
  both functions, so this *is* prevented — but only if both
  functions are guarded. An unguarded `#[view]` helper that
  reads stale state during the locked window can still be exploited
  (the "read-only reentrancy" pattern); we cover this in
  [the cross-contract section](ch09-03-cross-contract.md).
- Reentrancy through a *different contract* in a multi-contract
  chain (cross-contract reentrancy). Each contract has its own
  lock; contract A's guard cannot protect contract B.
- Reentrancy via a *trusted callee* that calls back into this
  contract through a function the user knew might re-enter (the
  legitimate `#[reentrant]` pattern). The guard is *removed* in
  this case, by design.

## Cost

The guard is two SSTORE operations per guarded call: one to set
the lock, one to clear it. The first write is the *fresh-slot
SSTORE* the first time the contract is called (paying full price
to allocate slot `0x3FFFE`); from then on it's a *modify SSTORE*
(cheaper). The exit clear pays the same modify cost.

In gas terms: a few thousand gas per call after the first. For a
function that already costs 50,000+ gas, the guard is in the
noise. For a function that costs 5,000 gas, the guard is a notable
fraction — but a 5,000-gas function that interacts with no
external contract probably doesn't need the guard anyway (and you
could mark it `#[view]` if it's read-only, eliminating both the
guard *and* the gas).

## Which functions get the guard

The compiler wraps a function with the guard if and only if all
of the following are true:

- The function is `pub`. Internal functions are not guarded —
  re-entry from outside has to go through a `pub` entry-point,
  which is where the guard sits.
- The function is *not* `#[view]`. Views can't mutate, so
  re-entering them doesn't break invariants.
- The function is *not* `#[constructor]`. Constructors run once
  and the question doesn't arise.
- The function is *not* `#[reentrant]`. That attribute exists
  exactly to opt out.

So the rule reads as: "every `pub` function that could mutate
state, unless you explicitly opted out".

## What the guard looks like in the metadata

The `.pyc` artifact's metadata includes a `guards` section listing
every function the compiler wrapped:

```json
"metadata": {
    "reentrancy_guards": [
        "deposit",
        "withdraw",
        "transfer",
        "approve"
    ]
}
```

Tooling can read this to verify that no production-critical
function accidentally lost its guard. The metadata is what an
auditor's checklist consults to confirm "every state-mutating
function I'm checking has the guard on".

## How a guard-violation looks

If a re-entry attempt fires the guard, the runtime returns a
revert payload carrying a special error: `ReentrancyDetected`. It's
a system-defined error (declared internally by the compiler, not
in your source); it has no fields, and downstream tooling renders
it as "transaction reverted: reentrancy detected".

You'll see this revert most often during *testing*, not in
production — a regression test that simulates a malicious callee
hits the guard and confirms it works. In production, an attempted
exploit shows up as a reverted transaction with no value moved.
The contract is intact; the attacker pays gas for nothing.

## Summary

The auto-guard is two storage operations around every state-
mutating public function, using a reserved slot at index
`0x3FFFE`. It prevents single-contract reentrancy — the DAO
attack and its direct variants — by making the function refuse to
re-enter itself or any other guarded function on the same
contract. It does not prevent cross-contract reentrancy through
multiple hops, or the read-only-reentrancy pattern that exploits
unguarded `#[view]` functions reading stale state. The cost is a
few thousand gas per guarded call, present in every gas estimate.

The [next section](ch09-02-opting-out.md) goes into the cases
where you'd disable the guard, and what discipline you replace
it with.
