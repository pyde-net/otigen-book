# The scheduler's view

A *block* on Pyde contains many transactions. Each transaction
carries an access list. The scheduler's job is to pick a subset
of those transactions that can run *in parallel without
conflicting* — and run them on different cores simultaneously.

This section walks through how the scheduler reads access lists,
what counts as a conflict, and the consequences for contract
design.

## What the scheduler sees

When the scheduler receives a block to execute, it has a list of
transactions, each with its access list. Conceptually:

```text
Tx 1: reads [token.balances[A]], writes [token.balances[A], token.balances[B]]
Tx 2: reads [dex.reserves], writes [dex.reserves, lp.positions[X]]
Tx 3: reads [token.balances[C]], writes [token.balances[C], token.balances[D]]
Tx 4: reads [token.balances[A]], writes [token.balances[A], token.balances[E]]
```

The scheduler walks pairs:

- **Tx 1 vs. Tx 2**: disjoint slots — *parallel-safe*.
- **Tx 1 vs. Tx 3**: disjoint addresses — *parallel-safe*.
- **Tx 1 vs. Tx 4**: both write `token.balances[A]` —
  *conflict*. The two must serialise.
- **Tx 2 vs. Tx 3**: disjoint — *parallel-safe*.
- **Tx 2 vs. Tx 4**: disjoint — *parallel-safe*.
- **Tx 3 vs. Tx 4**: disjoint addresses — *parallel-safe*.

Result: Txs 1, 2, 3 can run on three cores in the first wave;
Tx 4 runs in the second wave, after Tx 1 commits.

## The conflict rule

Two transactions conflict if and only if:

- Both *write* the same slot, OR
- One *reads* a slot that the other *writes*.

Two reads of the same slot — read-read — do not conflict.
Multiple transactions can read the same balance simultaneously
without serialising.

The slot identity is at the *fully-resolved* level: not
"`balances` map" but "`balances` map keyed by `0xAB...`". Two
writes to `balances[A]` conflict; a write to `balances[A]` and
a write to `balances[B]` do not. This is what makes the model
scale: token contracts have one map (`balances`) and millions
of disjoint entries, so transfers between distinct address
pairs parallelise trivially.

## Building the dependency graph

The scheduler constructs a *dependency DAG*:

- Nodes are transactions.
- Edges are conflicts: Tx X → Tx Y if X must commit before Y.

For an ordering provided by consensus (transactions are listed
in a particular order in the block), the edge direction follows
the order: an earlier transaction depends on nothing within the
block; a later transaction depends on every earlier transaction
that conflicts with it.

The scheduler then walks the DAG in *waves*. Each wave contains
transactions whose dependencies have all committed. Wave 1 is
the set of transactions with no dependencies; wave 2 is the set
of transactions whose dependencies are all in wave 1; and so
on.

Transactions within a wave execute *concurrently* — one per
core. The wave finishes when all its transactions have committed
their state; the next wave begins.

## How throughput scales

The peak parallelism is bounded by:

- The width of the dependency DAG (how many transactions are in
  the largest wave).
- The number of cores available to the scheduler.

A block of 1,000 transactions, where every transaction touches
a different account, has a DAG that's 1,000 wide and 1 deep —
*every* transaction is in wave 1. The scheduler runs as many
as it has cores for; an 8-core machine processes the block in
1/8th the wall-clock of a single-threaded run.

A block of 1,000 transactions that all touch the *same* slot
(say, all calling `bump_counter` on the same contract) has a
DAG that's 1 wide and 1,000 deep. The scheduler executes them
serially because there's no way to safely parallelise. The
single-counter pathological case is no faster than a
single-threaded run.

Most real-world traffic is somewhere in between: token
transfers form a sparse graph (most transfers don't conflict),
DEX swaps form a denser graph (every swap on the same pool
conflicts), governance votes form a sparser graph (each voter
writes their own slot).

## Why typed storage matters

The slot-level granularity of the conflict check is what makes
the system work. A scheme that conflated entire contracts
(`Tx 1 writes Token; Tx 2 reads Token; therefore conflict`)
would serialise every token operation. A scheme that conflated
entire maps (`Tx 1 writes balances; Tx 2 reads balances;
conflict`) would serialise every transfer. Slot-level
granularity says "Tx 1 wrote `balances[A]`; Tx 2 read
`balances[B]`; no conflict" — and that's what unlocks the
parallelism.

Otigen's typed `storage` block is what makes slot-level
discrimination possible. A loosely-typed storage layer
(Solidity's slot-bag-with-offsets) makes it harder for the
compiler to prove which slots a function touches; Otigen's
named-and-typed fields make the analysis straightforward.

## Implications for contract design

Two patterns help your contract parallelise well:

**Disjoint state per actor.** A contract whose primary state is
"per-user" (token balances, NFT ownership, per-account
allowances) parallelises trivially because different users
touch disjoint slots. A contract whose primary state is "global"
(a pool's reserves, an oracle's price, a counter) serialises
every interaction. Lean towards per-actor state where the
domain allows.

**Reads are free.** Multiple readers of the same slot don't
conflict. A `#[view]` that everyone queries can be called
millions of times per block without serialising. Heavy read
loads are the case the model handles best.

**Writes serialise their slots.** The first write to a slot
in a block claims it; later writes wait. If your contract
has a "hot slot" that every transaction writes, every
transaction serialises behind every prior one. Spread writes
across slots when you can.

A simple example. Two token-contract designs:

```otigen
// Design A: per-user balances. Parallelises well.
storage {
    balances: Map<Address, u256>,
}

// Design B: a global totals object plus per-user deltas. Serialises.
storage {
    totals: Totals,  // a struct of {minted, burned, transferred}
    user_deltas: Map<Address, u256>,
}
```

Design A: a `transfer` writes two `balances[X]` slots — disjoint
between unrelated transfers. 1,000 simultaneous transfers
between disjoint user pairs parallelise into 1 wave.

Design B: every `transfer` writes `totals` (one shared slot).
1,000 transfers all conflict on `totals`. The block serialises.

The design lesson: don't put a counter in a hot path unless you
need to. If "total transferred since deployment" is useful as a
view, derive it from events; don't aggregate into storage.

## Summary

The scheduler reads access lists, builds a conflict DAG (write-
write and read-write at the per-slot level), and groups
transactions into waves of parallel-safe execution. Slot-level
granularity is the key to the model; typed storage makes it
work. Per-actor state parallelises well; global hot slots
serialise. Design contracts so writes are spread across slots,
not concentrated on one.

The [next section](ch15-03-dynamic-paths.md) covers what
happens when the access list isn't fully known at scheduling
time — the Block-STM speculation fallback.
