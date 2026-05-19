# Dynamic paths and Block-STM

The previous sections assumed the access list is fully known at
scheduling time. For functions whose access pattern can be
statically inferred, it is. For functions whose accesses depend
on values that aren't visible until the function runs, the
scheduler has incomplete information — and Pyde handles those
with *Block-STM speculation*.

## What "dynamic" looks like

A function has a *dynamic* access pattern if any of these are
true:

- It uses a map keyed by a value read from another slot:
  `self.users[self.current_admin]`.
- It uses a map keyed by the return of a function call:
  `self.balance[helper()]`.
- It makes a cross-contract call to a target the compiler
  doesn't have the source of: `Interface::at(unknown).foo()`.
- It uses `raw_call!` with calldata the compiler can't analyse.
- It iterates a `Vec` of indeterminate size and writes per-
  element slots.

None of these are unusual. The middle case (cross-contract
calls to unknown targets) is the most common in DeFi — any
contract that calls an external token, an external oracle, or
an external bridge has dynamic access semantics.

## Block-STM speculation

When the scheduler sees a transaction with an incomplete
access list, it has two choices:

1. **Pessimistic**: assume the transaction conflicts with
   *everything* and serialise it after every transaction in
   the block.
2. **Optimistic**: assume the transaction conflicts with
   nothing, run it in parallel anyway, and verify after the
   fact that the assumption held.

Pyde takes the optimistic approach: *Block-STM speculation*.

The mechanism:

1. The scheduler runs the dynamic-access transaction
   *concurrently* with other transactions, in its own
   speculative-execution sandbox.
2. As the transaction executes, the runtime records every slot
   it reads and writes.
3. When the transaction finishes, the runtime compares its
   *actual* access set against the access sets of other
   transactions that ran concurrently.
4. If there's no conflict, the transaction's writes commit
   normally — it parallelised successfully.
5. If there's a conflict (the transaction read a slot that
   another concurrent transaction wrote, or vice versa), the
   transaction's writes are *rolled back* and the transaction
   is *re-executed* in the next wave with the conflicting
   transaction's state visible.

The re-execution is the cost of being wrong about the
optimistic assumption. For a contract designer, the question is
how often the assumption is wrong.

## How often does speculation succeed?

For most real-world workloads, the answer is "most of the
time". A typical block has:

- Many transactions touching unrelated state. (token transfers
  between unrelated users, distinct NFT mints, distinct
  governance votes). Speculation succeeds; full parallelism is
  achieved.
- A small number of transactions touching shared state. (DEX
  swaps on the same pool, governance votes on the same
  proposal). Speculation often fails for some of these; the
  failed ones re-execute serially.
- Occasional pathological cases (every transaction in the
  block touches one hot slot). Speculation almost always
  fails; the block executes effectively serially.

The cost of a failed speculation is the gas paid to execute the
transaction *once* under the wrong assumption — the runtime
abandons the result and re-executes. Empirically, this is
typically a single-digit-percent throughput hit even under
heavy contention, because most transactions in a real block
*are* independent.

## Implications for contract design

A few patterns make speculation more likely to succeed:

**Make storage accesses early in the function.** If a function
reads `self.x` early and then does a lot of work, a conflict
on `self.x` is detected early and the re-execution doesn't
waste much work. Hoisting storage reads to the top of the
function is a small win.

**Avoid making cross-contract calls inside a hot loop.** Each
cross-contract call introduces dynamic access semantics; a
loop that makes one per iteration is N dynamic regions to
speculate over. Often the cleaner shape is to compute all the
inputs up front, do one cross-call with batched data, and
process the results in another loop.

**Cache frequently-read storage.** Reading `self.some_field`
five times costs five SLOADs and gives five chances for a
concurrent writer to invalidate your speculation. Reading
once into a local — `let x = self.some_field;` — and using
the local five times costs one SLOAD and one chance.

**Don't put a counter in the hot path.** This was the
previous section's advice too. A counter is the canonical
"every transaction conflicts" pattern; if your contract has
one, every transaction in the block will conflict on it and
speculation will fail.

## When speculation can't help

The pathological cases — where every transaction in a block
genuinely touches the same slot — are unsolvable by parallel
execution. A liquidity pool with thousands of pending swaps
all on the same pool serialises no matter how clever the
scheduler is; the *semantic* dependency is real.

The recourse for these is at the *application* layer:
batch-and-settle protocols, off-chain order books that submit
net settlement, sharded pools where each shard handles its
own slot. The chain provides parallelism for *independent*
transactions; pooling the dependent ones into something the
chain can run in one pass is a contract-design discipline.

## Block-STM in the engine

The Block-STM implementation lives in the consensus and
execution layers, not in the contract's bytecode. Your contract
doesn't change behaviour depending on whether it's running
under speculation or serial execution — the runtime guarantees
the *same outcome* either way. Speculation is an optimisation,
not a semantic.

This means: you can read the rest of the book confidently
without thinking about Block-STM at every turn. Your contract
runs correctly; the runtime decides how fast.

## Summary

Functions with dynamic access patterns (storage-keyed maps,
cross-contract calls, `raw_call!`, runtime-bounded loops)
defeat the static access list. Pyde handles these with
Block-STM speculation: run them concurrently, track their
actual accesses, and roll back + re-execute if a conflict is
detected. For most workloads, speculation succeeds the
overwhelming majority of the time. Patterns that hurt
speculation are hot counters, deeply-conflicting loops, and
cross-calls inside tight loops; the application-layer
recourse for genuinely-contended state is batch-and-settle.

That's the end of the access-list chapter. The
[next chapter](ch16-00-threshold-encryption.md) covers the
other distinctive Pyde runtime feature: threshold-encrypted
transactions.
