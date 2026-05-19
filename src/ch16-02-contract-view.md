# From the contract's point of view

This section is short, because the answer is short:

**Your contract sees plaintext, after the ordering is decided,
exactly as it would in a non-encrypted chain.**

The threshold-encryption pipeline does its work *before* your
contract runs. By the time the VM is executing your function,
the encrypted blob has been decrypted, the ordering has been
committed, and the calldata that arrives at your function looks
identical to a plaintext-submitted transaction.

## What this means in practice

Your contract is entirely *unaware* of how the transaction got
there. Inside your function:

- `msg.sender` is the original transaction signer.
- `msg.value` is the original attached value.
- `msg.data` is the original calldata.
- `block.timestamp`, `block.anchor`, and every other built-in
  global behave normally.

You write functions exactly as you would on a chain without
threshold encryption. The whole token contract from
[Chapter 12](ch12-00-project-token.md) doesn't change a line
under the encrypted-mempool design.

This is the *point*. The threshold-encryption pipeline is a
runtime feature, not a language feature. Contracts that need
MEV protection get it for free, because the chain enforces the
protection at the ordering layer. Contracts that don't care
about MEV don't pay any complexity tax — they don't see the
mechanism at all.

## What you *can't* do from a contract

Two things follow from "the contract sees post-decryption
plaintext":

- **You can't react to the encrypted form.** The contract
  never has access to the ciphertext bytes. There's no `if
  msg.was_encrypted { ... }` branch. The chain treats encrypted
  and plaintext submissions identically once decryption is
  done.
- **You can't introspect the decryption process.** No built-in
  exposes "how many decryption shares were used", "which
  validators contributed", or "how long decryption took". The
  decryption is a chain-internal mechanism; contracts read its
  *output*, not its *internals*.

These restrictions are intentional. The threshold-encryption
pipeline is a sealed primitive: the chain promises that the
ordering is fair and the plaintext is correct; contracts don't
need to verify either of those properties at runtime.

## When the contract *can* tell the difference

In one edge case, the encryption path is observable: a
transaction that was *successfully decrypted* in the ceremony
still might *fail to execute* (a `require!` rejects it, an
overflow traps, etc.). The plaintext execution is what runs;
the encrypted submission is just how it got into the queue. So
a contract sees the same execution behaviour whether the
transaction arrived encrypted or plaintext.

The chain *also* exposes the encryption metadata in the
transaction *receipt* — a flag indicating "this tx was
encrypted on submission". Receipts are read by off-chain
tooling, not by the contract itself. If your indexer cares
which transactions arrived encrypted (to render a privacy
badge in a UI, say), the receipt flag is where it looks.

## Implications for contract design

The design principle: **don't try to outsmart the encryption
layer**. Your contract's logic doesn't need to think about
front-running, sandwich attacks, or copy-trading — the chain's
ordering primitive already handles them. Write your function
to do what it should do given its inputs; trust that the
chain ordered the inputs fairly.

This frees you from some patterns that EVM contracts adopt
defensively:

- **Commit-reveal** for auctions. The encryption *is* the
  commit-reveal, applied at the chain layer. You don't need
  a two-transaction commit-reveal flow for sealed bids.
- **TWAP oracles** for price-feed manipulation resistance.
  The price-update transaction can't be sandwiched, so spot
  reads from your oracle aren't manipulable in the same way.
  TWAPs may still be useful for *volatility* smoothing, but
  not for *MEV* defence.
- **Slippage tolerance** on DEX swaps. The amount of slippage
  protection you actually need shrinks because sandwich
  attacks are gone. You'll still want some tolerance for
  legitimate price drift, but it can be tighter than on a
  chain with public mempools.

None of these defenses *hurt* — you can still apply them — but
the pressure to apply them eases.

## Summary

Your contract sees plaintext, in order, exactly as if the
chain had no encryption pipeline. The mechanism is sealed:
contracts can't introspect it, react to it, or differ in
behaviour based on it. The chain promises fair ordering;
contracts spend their effort on what they actually do.

The [next section](ch16-03-when-matters.md) covers when this
guarantee matters most — the contract categories where MEV
defence is the whole point.
