# From the user's point of view

This section describes the user's experience of submitting an
encrypted transaction. The wallet does the work; the user mostly
sees the same flow as a regular submission, with the privacy
guarantee changed.

## The submission flow

A normal (plaintext) transaction:

```text
1. User builds the transaction (target, calldata, value, gas).
2. Wallet signs it.
3. Wallet sends it to a validator's RPC endpoint.
4. Validator sees the plaintext, includes it in a block.
5. Network commits the ordering.
6. The transaction executes.
```

An encrypted transaction extends step 2:

```text
1. User builds the transaction.
2a. Wallet signs it (the signature is over the plaintext, so
    that submission ordering can be authenticated).
2b. Wallet encrypts the calldata + value under the committee
    public key. The encryption uses Kyber-768 KEM + a symmetric
    cipher; the ciphertext includes the public key wrap and
    the encrypted blob.
3. Wallet sends the *encrypted* transaction to RPC.
4. Validators see only the envelope: sender, target,
   gas-limit, and the ciphertext.
5. Validators include the encrypted transaction in a block
   and commit the ordering — without seeing the calldata.
6. After the ordering is committed, the committee runs a
   threshold decryption ceremony. Each validator computes
   their share of the decryption; once 2/3 of them have
   contributed, the plaintext is recovered.
7. The transaction executes, in the pre-committed order.
```

The user doesn't see steps 2b or 6 directly. The wallet handles
the encryption; the chain handles the decryption.

## What the validator sees pre-decryption

In step 4, what a validator actually has is a *transaction
envelope*:

```text
sender:    Address                   // visible
gas_limit: u64                       // visible
gas_price: u256                      // visible
nonce:     u64                       // visible
signature: bytes                     // visible
encrypted: bytes                     // opaque ciphertext
```

The visible fields are what the validator needs to do *its job*
— enforce gas accounting, sequence by nonce, reject replays.
They don't reveal what the transaction *does*. The contract,
function, arguments, and any attached value are all inside the
encrypted blob.

## What the committee public key is

The committee public key is a *Kyber-768* public key whose
secret is *threshold-shared* among the validators. No single
validator holds the secret; only a quorum (2/3 of the committee)
collectively can decrypt. The wallet doesn't know any
individual validator's share — it encrypts to the *committee*
public key, and the threshold-decryption ceremony is what
recovers the plaintext.

The committee key rotates periodically (per epoch). The wallet
fetches the current key from an RPC node before encrypting; the
fetched key is signed by the previous committee to prevent a
malicious node from substituting its own.

## What the wallet's encryption step does

The wallet's encryption step lowers to one function call:

```text
let ciphertext = threshold_encrypt(committee_pk, plaintext_tx);
```

The implementation does:

1. Kyber-768 KEM-encapsulate to the committee public key — get
   a random shared secret and a "wrap" of that secret.
2. Use the shared secret to derive a symmetric encryption key
   (and a separate authentication key).
3. Symmetrically encrypt the transaction's plaintext.
4. Authenticate the ciphertext with the auth key.
5. Bundle (wrap, encrypted, MAC) as the ciphertext.

The `threshold_encrypt` function in `crypto/src/threshold.rs`
is the canonical implementation. It's a few hundred lines of
Rust and runs in milliseconds.

## How decryption happens

After validators commit the block's transaction ordering, the
committee runs a *decryption ceremony*:

1. Each validator computes their decryption share of every
   encrypted transaction in the block, using their key share.
   Each share is signed by the validator's FALCON key (so
   shares can't be forged by others).
2. The shares are gossipped between validators.
3. Once a validator collects ≥ 2/3 of the shares for a given
   transaction, they can combine them (Lagrange interpolation)
   to recover the symmetric key, decrypt the ciphertext, and
   verify the MAC.
4. The plaintext transaction is then executed in the pre-
   committed order.

The whole ceremony happens at the wave-commit boundary — the
threshold decryption is pipelined with the next round's
proposal, so it doesn't add latency to throughput in steady
state.

## The current state

> The flow above describes the target mainnet architecture.
> Today (pre-mainnet), the chain executes plaintext
> transactions; the encryption path is not wired in. The
> wallet libraries don't yet have a "submit encrypted"
> function; the validators don't yet run the decryption
> ceremony. The crypto primitives exist in
> `crypto/threshold.rs`, but the consensus and execution
> layers haven't been updated to consume them.
>
> When this lands, your wallet will simply have a flag — "send
> encrypted: yes/no" — and your contracts will see plaintext
> in either case (because the chain decrypts before
> execution). The chapter is in the book now because the
> contract-design implications are real even before the
> pipeline ships.

## What the user *gains*

When threshold encryption is live:

- **Front-running is impossible.** No one can see your trade
  before it's ordered. A pending swap can't be sandwiched
  because the sandwicher doesn't know your slippage.
- **Sandwiching is impossible.** Same reason.
- **Auctions are sealed.** A bid encrypted to the committee
  can't be observed by competing bidders before commit.
- **Oracle updates are immune to copy-trading.** An oracle's
  update can't be observed by trades that race to use the
  new value.

What's still visible:

- **The fact that you submitted.** Validators see your
  envelope; they know you exist and you're acting.
- **The gas you're willing to pay.** Encrypted in the
  ciphertext is the function call; the gas-pricing fields
  are still in the envelope.
- **Your historical behaviour.** Past transactions, once
  executed, are on-chain in plaintext. Statistical analysis
  over time still works.

## What the user *doesn't* see

A few things to be aware of:

- **Decryption can fail.** If the committee can't collect 2/3
  shares (a stalled committee, a network partition), the
  decryption ceremony stalls. The transaction's ordering is
  committed but its execution is deferred until decryption
  succeeds.
- **Encryption costs gas at the wallet.** Negligibly — the
  Kyber-768 encryption is microseconds.
- **The wallet must trust the committee key it fetches.**
  Until the wallet has the right key, it can't encrypt.

## Summary

The user-side flow: wallet builds a transaction, signs it,
encrypts the sensitive parts under the committee public key,
submits the ciphertext. Validators commit the order without
seeing the contents; the threshold-decryption ceremony reveals
the contents post-ordering. Today the pipeline is not yet
wired in — the chain runs plaintext — but the wallet and
contract surface that will exist at mainnet is described
above.

The [next section](ch16-02-contract-view.md) covers what your
contract sees in all of this, which is — usefully —
*nothing different from a plaintext transaction*.
