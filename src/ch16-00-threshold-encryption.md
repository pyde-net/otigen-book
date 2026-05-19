# Threshold-Encrypted Transactions

Maximum Extractable Value — MEV — is the practice of validators
extracting profit by reordering, inserting, or omitting
transactions in a block. Sandwich attacks, front-running,
back-running, and the rest of the family follow from the same
structural fact: validators *see* transactions before they
*commit* them. They choose the order, and the order is worth
money.

Pyde flips this. Transactions are submitted *encrypted* to a
committee public key. Validators commit to an ordering — the
DAG-anchor commit — *before* anyone can decrypt them. After the
ordering is committed, the committee runs a threshold
decryption ceremony to reveal the plaintexts, and the
already-ordered transactions execute in their pre-decryption
order. Validators never get to choose the order based on
content, because they don't *have* the content when the ordering
happens.

This chapter explains the primitive — what it is, what it
protects against, and what your contract should know about it.

> **Implementation status.** The threshold-encryption primitives
> are production-ready in `engine/crates/crypto/src/threshold.rs`
> (Kyber-768 + Shamir sharing + FALCON-bound decryption shares).
> The transaction pipeline that *uses* the primitives — the
> encrypted mempool, the post-ordering decryption ceremony, the
> block-format integration — is **not yet wired in**. Today,
> transactions are submitted in plaintext and ordered + executed
> directly. The chapter describes the target architecture
> mainnet is being built toward; it flags throughout what works
> today versus what will land later.

Three sections:

- [From the user's point of view](ch16-01-user-view.md) — what
  the wallet does when threshold encryption is live.
- [From the contract's point of view](ch16-02-contract-view.md)
  — what an Otigen contract sees regardless of the
  pipeline status: plaintext, in order, period.
- [When it matters](ch16-03-when-matters.md) — the contract
  designs that should care about this primitive and the ones
  that needn't.
