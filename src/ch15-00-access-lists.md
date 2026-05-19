# Access Lists and Parallel Execution

Most blockchains execute transactions one at a time. Each
transaction reads and writes the global state; the runtime
serialises them so that two transactions can never disagree
about a slot's value. This is the simplest model — and the
slowest.

Pyde executes transactions in *parallel*: independent
transactions run on different cores simultaneously, and only
*dependent* transactions are serialised. The mechanism is an
*access list* — a per-transaction declaration of which storage
slots the transaction will read and which it will write. The
scheduler builds a dependency graph from access lists and runs
non-conflicting transactions concurrently.

This chapter covers the model. **A note before we start:**

> **Implementation status.** The runtime-side of access lists is
> implemented: every transaction carries an `access_list` field
> in the wire format (`engine/crates/tx/src/types.rs`), and the
> PVM checks every Sload and Sstore against the declared list
> at execution time (`engine/crates/pvm/src/vm.rs`). The
> compiler-side — the static-inference pass that would emit a
> per-function access list directly from the typed `storage`
> block — is **not yet implemented in `otic`**. Today, access
> lists are populated by simulation (the chain runs the
> transaction once to observe its accesses) or by the
> transaction submitter explicitly. The compiler's role in this
> pipeline is a designed-but-not-yet-shipped feature.
>
> The chapter describes the *target architecture* the language
> is being built toward. Where it matters, it flags what works
> today versus what will land later.

With that out of the way, the three sections:

- [Static inference](ch15-01-static-inference.md) — the
  pass the compiler will perform once shipped, and how the
  typed storage block makes it possible.
- [The scheduler's view](ch15-02-scheduler.md) — how the
  runtime uses access lists to parallelise.
- [Dynamic paths and Block-STM](ch15-03-dynamic-paths.md) —
  what happens when a function's access pattern isn't
  statically inferable, and Pyde's optimistic-execution
  fallback.

If you skip this chapter, your contracts still work — the
chain handles access-list discovery for you. Reading it tells
you *why* certain function shapes parallelise well and others
don't.
