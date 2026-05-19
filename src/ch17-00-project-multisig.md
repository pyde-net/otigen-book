# Project — A Multisig Wallet

A *multisig* is a contract that requires M-of-N authorised
signers to agree before it executes a transaction. Multisigs
hold treasuries, control protocol upgrades, and own large
allocations of value. They're one of the highest-stakes
contract categories on any chain.

In this chapter we'll build a working M-of-N multisig from
scratch — submit a proposed action, collect confirmations from
owners, execute when threshold is met. By the end you'll have
the same shape that secures most of DeFi: a contract you can
deploy to manage a fund, with on-chain signature aggregation
and replay protection.

The chapter applies what we've covered in Chapters 1–11,
particularly:

- **Storage and maps** ([Ch 4](ch04-00-storage-and-maps.md)) —
  the owner set, the proposal set, the per-proposal
  confirmation tally.
- **Structs and enums** ([Ch 5](ch05-00-structs-enums.md)) —
  the `Proposal` struct, the `Status` enum.
- **Errors and events** ([Ch 6](ch06-00-errors.md) and
  [Ch 7](ch07-00-events.md)) — typed failures for unauthorised
  callers, already-executed proposals, missing approvals.
- **Cross-contract calls** ([Ch 10](ch10-00-cross-contract.md))
  — the actual execution of the proposal's payload via
  `raw_call!`.
- **Reentrancy and check-effects-interactions**
  ([Ch 9](ch09-00-reentrancy.md)) — the `execute` function
  follows the discipline.

## 17.1 What we're building

A multisig with this surface:

- **Owners** — a fixed set of addresses, configured at deploy
  time. Threshold M-of-N: at least M owners must confirm
  before any proposal can execute.
- **Proposals** — submitted by an owner. Each carries the
  target address, the calldata, the value to send, a nonce,
  and a list of confirmations.
- **Confirmations** — each owner can mark "approve" or
  "revoke" on any pending proposal. Once M approvals are in,
  any owner can call `execute` to fire the proposal's
  payload.
- **Replay protection** — every proposal carries a strictly
  increasing nonce; once executed, the proposal cannot be
  re-executed.

We'll build it incrementally. Start with the bare structure,
add proposals, add confirmations, then the execution step.

## 17.2 Scaffolding

```sh
$ pyde-dev init multisig
$ cd multisig
$ rm src/Counter.oti test/Counter.test.oti
$ touch src/Multisig.oti test/Multisig.test.oti
```

## 17.3 Constructor and owner set

The shape of the contract is starting to come into view:

<span class="filename">Filename: src/Multisig.oti</span>

```otigen
contract Multisig {
    storage {
        owners: Map<Address, bool>,
        owner_count: u32,
        threshold: u32,
        proposal_count: u64,
    }

    error InvalidThreshold {}
    error NotAnOwner { caller: Address }

    #[constructor]
    pub fn init(owners: Vec<Address>, threshold: u32) {
        require!(threshold > 0 && (threshold as u64) <= (owners.len() as u64),
                 InvalidThreshold {});

        let mut i = 0u64;
        let n = owners.len();
        while i < n {
            self.owners[owners[i]] = true;
            i = i + 1;
        }
        self.owner_count = n as u32;
        self.threshold = threshold;
    }

    fn require_owner() {
        require!(self.owners[msg.sender], NotAnOwner { caller: msg.sender });
    }
}
```

<span class="caption">Listing 17-1: constructor + owner-only guard</span>

A few decisions baked in already:

**The owner set is a map, not a vec.** Lookup by address is
O(1); we'd be doing `self.owners[caller]` constantly. A `Vec`
of owners would need a linear scan to check "is this address
an owner". The map is the right structure for the check.

**A separate `owner_count` field.** Because maps aren't
iterable (we covered this in [Ch 4.2](ch04-02-maps.md)), we
keep an explicit count of how many owners exist. This is the
"parallel `Vec<K>` or `count` next to a map" pattern from
that chapter.

**`require_owner` is an internal helper.** Every public
mutator will call it. Defining it once centralises the check.

## 17.4 Submitting a proposal

A proposal is a typed payload — target, calldata, value, plus
the metadata to track its lifecycle:

<span class="filename">Filename: src/Multisig.oti</span>

```otigen
struct Proposal {
    id: u64,
    target: Address,
    calldata: bytes,
    value: u256,
    submitted_by: Address,
    submitted_at: u64,
    confirmations: u32,
    executed: bool,
}

event ProposalSubmitted {
    #[indexed]
    proposal_id: u64,
    #[indexed]
    submitted_by: Address,
    target: Address,
    value: u256,
}

error ProposalAlreadyExecuted { proposal_id: u64 }

storage {
    // (existing fields)
    proposals: Map<u64, Proposal>,
    confirmations: Map<u64, Map<Address, bool>>,
}

pub fn submit(target: Address, calldata: bytes, value: u256) -> u64 {
    self.require_owner();

    let id = self.proposal_count;
    self.proposal_count = id + 1;

    self.proposals[id] = Proposal {
        id: id,
        target: target,
        calldata: calldata,
        value: value,
        submitted_by: msg.sender,
        submitted_at: block.timestamp,
        confirmations: 0,
        executed: false,
    };

    emit ProposalSubmitted {
        proposal_id: id,
        submitted_by: msg.sender,
        target: target,
        value: value,
    };

    return id;
}
```

<span class="caption">Listing 17-2: proposal submission</span>

The submitter gets back the new proposal's id. Off-chain
tooling watches for `ProposalSubmitted` events to render
pending actions for other owners to confirm.

`confirmations` is a *separate* nested map: `proposal_id →
owner → confirmed?`. We don't store the list of confirming
owners inside the `Proposal` struct; that would mean
re-writing the whole struct on each confirmation. Splitting
out the per-owner confirmation flag means each confirmation
touches a single map slot.

## 17.5 Confirming a proposal

```otigen
event ProposalConfirmed {
    #[indexed]
    proposal_id: u64,
    #[indexed]
    confirmer: Address,
    confirmations_now: u32,
}

event ProposalRevoked {
    #[indexed]
    proposal_id: u64,
    #[indexed]
    revoker: Address,
}

error UnknownProposal { proposal_id: u64 }
error AlreadyConfirmed { proposal_id: u64, owner: Address }
error NotConfirmed { proposal_id: u64, owner: Address }

pub fn confirm(proposal_id: u64) {
    self.require_owner();

    let p = self.proposals[proposal_id];
    require!(p.target != Address::ZERO || p.submitted_at > 0,
             UnknownProposal { proposal_id: proposal_id });
    require!(!p.executed,
             ProposalAlreadyExecuted { proposal_id: proposal_id });
    require!(!self.confirmations[proposal_id][msg.sender],
             AlreadyConfirmed { proposal_id: proposal_id, owner: msg.sender });

    self.confirmations[proposal_id][msg.sender] = true;
    self.proposals[proposal_id].confirmations = p.confirmations + 1;

    emit ProposalConfirmed {
        proposal_id: proposal_id,
        confirmer: msg.sender,
        confirmations_now: p.confirmations + 1,
    };
}

pub fn revoke(proposal_id: u64) {
    self.require_owner();

    let p = self.proposals[proposal_id];
    require!(!p.executed,
             ProposalAlreadyExecuted { proposal_id: proposal_id });
    require!(self.confirmations[proposal_id][msg.sender],
             NotConfirmed { proposal_id: proposal_id, owner: msg.sender });

    self.confirmations[proposal_id][msg.sender] = false;
    self.proposals[proposal_id].confirmations = p.confirmations - 1;

    emit ProposalRevoked {
        proposal_id: proposal_id,
        revoker: msg.sender,
    };
}
```

<span class="caption">Listing 17-3: confirm and revoke</span>

A few design notes:

**Owners can revoke their confirmation** if the proposal hasn't
yet executed. This is the standard multisig safety property —
if an owner sees that a previously-submitted proposal turns
out to be malicious, they can pull their approval before
threshold is reached.

**Each confirmation updates the running tally.** We don't
recompute the count by iterating the owners (we couldn't —
maps aren't iterable). The cached `confirmations` field on the
proposal is the source of truth for "how close are we to
executing".

**The `UnknownProposal` check uses two heuristics.** A never-
written proposal entry returns a struct with `target ==
Address::ZERO` and `submitted_at == 0`. We check both fields
because either alone could be a real (but unusual) proposal
— for example, a deliberate `target: Address::ZERO` is invalid
in practice but would slip past a check on `submitted_at`
alone.

## 17.6 Executing the proposal

The execute step is where the multisig actually *does
something* — a cross-contract call to the proposal's target
with the stored calldata. This is the function that needs
check-effects-interactions discipline because it makes an
external call.

```otigen
event ProposalExecuted {
    #[indexed]
    proposal_id: u64,
    #[indexed]
    executed_by: Address,
    success: bool,
}

error InsufficientConfirmations { have: u32, need: u32 }
error CallFailed { proposal_id: u64 }

pub fn execute(proposal_id: u64) {
    self.require_owner();

    let p = self.proposals[proposal_id];
    require!(!p.executed,
             ProposalAlreadyExecuted { proposal_id: proposal_id });
    require!(p.confirmations >= self.threshold,
             InsufficientConfirmations {
                 have: p.confirmations,
                 need: self.threshold,
             });

    // 1. Mark as executed BEFORE the external call.
    self.proposals[proposal_id].executed = true;

    // 2. The external call.
    let (ok, _) = raw_call!(
        target: p.target,
        calldata: p.calldata,
        gas: gas_remaining(),
        value: p.value,
    );

    require!(ok, CallFailed { proposal_id: proposal_id });

    emit ProposalExecuted {
        proposal_id: proposal_id,
        executed_by: msg.sender,
        success: true,
    };
}
```

<span class="caption">Listing 17-4: execute with CEI ordering</span>

The check-effects-interactions order is the whole point:

1. **Check** — owner gate, not-yet-executed, enough confirmations.
2. **Effect** — mark the proposal `executed: true` *before*
   the external call.
3. **Interact** — fire the `raw_call!`.

If the target of the call were to call back into this multisig
trying to re-execute the same proposal, the `!p.executed`
check in the second-entry would fail (because we set executed
*before* the call), and the re-entry would revert. The
external call to a malicious target cannot drain the multisig.

## 17.7 Adding emergency pause

For a contract that holds significant value, a circuit breaker
is good hygiene. We add a pause flag that any owner can flip
to halt all new submissions and confirmations:

```otigen
event Paused {
    #[indexed]
    by: Address,
}

event Unpaused {
    #[indexed]
    by: Address,
}

error ContractPaused {}

storage {
    // (existing fields)
    is_paused: bool,
}

fn require_unpaused() {
    require!(!self.is_paused, ContractPaused {});
}

pub fn pause() {
    self.require_owner();
    self.is_paused = true;
    emit Paused { by: msg.sender };
}

pub fn unpause() {
    self.require_owner();
    self.is_paused = false;
    emit Unpaused { by: msg.sender };
}
```

Wire `require_unpaused()` into `submit`, `confirm`, and
`execute`. Pause is a per-owner action (any owner can pause),
but unpause is also per-owner (any owner can unpause). For
some designs you might want a higher bar for unpause (M-of-N
agreement), but the simple form here is enough to demonstrate
the pattern.

## 17.8 Testing

A test suite that exercises the happy path and the failure
modes:

<span class="filename">Filename: test/Multisig.test.oti</span>

```otigen
use multisig::Multisig;
use std::vm;

contract MultisigTest {
    fn vm_handle() -> Vm {
        return Vm::at(0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC as Address);
    }

    fn deploy_2of3() -> (Contract<Multisig>, Address, Address, Address) {
        let vm_h = vm_handle();
        let alice = vm_h.makeAddr(1);
        let bob   = vm_h.makeAddr(2);
        let carol = vm_h.makeAddr(3);

        let mut owners: Vec<Address> = Vec::new();
        owners.push(alice);
        owners.push(bob);
        owners.push(carol);

        let m = deploy!(Multisig, owners, 2u32);
        return (m, alice, bob, carol);
    }

    #[test]
    fn deployed_with_three_owners_and_threshold_two() {
        let (m, _, _, _) = deploy_2of3();
        // Sanity check via a #[view] getter we'd add to the contract.
    }

    #[test]
    #[should_panic(expected = "NotAnOwner")]
    fn non_owner_cannot_submit() {
        let (m, _, _, _) = deploy_2of3();
        let vm_h = vm_handle();
        let stranger = vm_h.makeAddr(99);
        vm_h.prank(stranger);
        m.submit(0xDEAD_addr_DEAD as Address, b"", 0);
    }

    #[test]
    fn two_confirmations_executes() {
        let (m, alice, bob, _) = deploy_2of3();
        let vm_h = vm_handle();

        vm_h.prank(alice);
        let id = m.submit(0xBEEF_BEEF as Address, b"hello", 0);

        vm_h.prank(alice);
        m.confirm(id);

        vm_h.prank(bob);
        m.confirm(id);

        // 2 confirmations meets the threshold; execute should succeed.
        vm_h.prank(alice);
        m.execute(id);
        // Verify via a #[view] that p.executed == true.
    }

    #[test]
    #[should_panic(expected = "InsufficientConfirmations")]
    fn one_confirmation_cannot_execute() {
        let (m, alice, bob, _) = deploy_2of3();
        let vm_h = vm_handle();

        vm_h.prank(alice);
        let id = m.submit(0xBEEF_BEEF as Address, b"hello", 0);
        vm_h.prank(alice);
        m.confirm(id);
        // Only one confirmation; execute must fail.
        vm_h.prank(alice);
        m.execute(id);
    }

    #[test]
    #[should_panic(expected = "ProposalAlreadyExecuted")]
    fn cannot_double_execute() {
        let (m, alice, bob, _) = deploy_2of3();
        let vm_h = vm_handle();

        vm_h.prank(alice);
        let id = m.submit(0xBEEF_BEEF as Address, b"hello", 0);
        vm_h.prank(alice);
        m.confirm(id);
        vm_h.prank(bob);
        m.confirm(id);
        vm_h.prank(alice);
        m.execute(id);
        // Second execute must fail.
        vm_h.prank(alice);
        m.execute(id);
    }
}
```

<span class="caption">Listing 17-5: test suite</span>

The patterns:

- **`vm_h.prank(owner)`** to act as a particular owner. Each
  `prank` applies to the *next* external call only.
- **`#[should_panic(expected = "ErrorName")]`** for every
  test that exercises a typed error.
- **`deploy_2of3`** as a shared setup helper, returning the
  contract plus the three owner addresses for the tests to
  use.

## 17.9 What we built

The multisig is around 150 lines of contract code and exercises
just about every concept we've covered so far. Counting the
pieces:

- A typed `Proposal` struct with eight fields.
- A nested `confirmations: Map<u64, Map<Address, bool>>`.
- Seven `pub fn` methods (`init`, `submit`, `confirm`, `revoke`,
  `execute`, `pause`, `unpause`).
- Seven events (`ProposalSubmitted`, `ProposalConfirmed`,
  `ProposalRevoked`, `ProposalExecuted`, `Paused`, `Unpaused`).
- Seven typed errors covering every failure mode.
- Check-effects-interactions in the `execute` function — the
  one path that calls out.
- An emergency-pause circuit breaker.

This is the shape that secures most of DeFi. Bigger multisigs
add more knobs — threshold changes via multi-sig action,
expiration of pending proposals, batched proposals — but the
core is what you just built.

The [next chapter](ch18-00-project-dex.md) is the final
project: a constant-product AMM that composes with the token
from [Chapter 12](ch12-00-project-token.md) and takes advantage
of Pyde's threshold-encryption primitive to make sandwich
attacks impossible.
