# When it matters

Threshold encryption is a runtime feature, not a language one
— your contract code doesn't change based on whether it's
deployed against an encrypted-mempool chain. But the design
*choices* you make for some contracts are different depending
on the chain's MEV posture. This section sorts contract
categories by how much they benefit from threshold encryption,
so you know where to look for design adjustments.

## Contracts that benefit most

These are the contracts that MEV most aggressively attacks on
public-mempool chains. On a threshold-encrypted chain, the
attack surface contracts:

### Decentralised exchanges

A DEX is the canonical MEV target. On a chain with a public
mempool:

- A pending swap is visible to sandwichers, who buy in front
  of it, sell behind it, and extract the difference.
- A pending limit order is visible to copy-traders, who match
  the same target as the original order to capture rebates.
- A liquidity-addition is visible to front-runners, who buy
  the underlying before the liquidity arrives and benefit
  from the price impact.

Under threshold encryption: the swap isn't visible until after
its order is committed. Sandwiching is impossible because the
sandwicher doesn't know the swap's parameters when they'd need
to act. Copy-trading is impossible because the order isn't
visible until execution. The DEX's slippage tolerances can be
much tighter than they'd need to be on a public-mempool chain.

This is the contract category we revisit in
[Chapter 18](ch18-00-project-dex.md) — building a DEX *for*
the encrypted-mempool environment, taking advantage of the
property where it matters.

### Auctions

Sealed-bid auctions on public-mempool chains require
two-transaction *commit-reveal*: bidders first commit a hash
of their bid, then in a later block reveal the bid value.
This is awkward — bidders can refuse to reveal, the auction
has to handle that, the UX is one extra transaction.

Under threshold encryption, the encryption itself *is* the
seal. A bid encrypted to the committee can't be read by
competing bidders before commit. The single-transaction
encrypted bid replaces the commit-reveal flow entirely.

### Oracle updates

A oracle that publishes a new price update on a public-
mempool chain can be front-run: another contract sees the
pending update and races to act on the new value before the
oracle's contract has stored it. On an encrypted chain, the
update isn't visible until after ordering — no front-run is
possible.

### Liquidation triggers

A lending protocol that triggers liquidations when a
collateral ratio crosses a threshold can be front-run on
public chains: a watcher sees a pending update that would
push a position into liquidation, races to liquidate first,
and captures the liquidation bonus. On an encrypted chain,
this race is gone.

### Privacy-sensitive governance

Some governance proposals are sensitive to ordering — a vote
to change a parameter, observed before the vote is
processed, could be front-run by traders adjusting positions.
The encrypted-mempool design defends against this category.

## Contracts that don't particularly benefit

For these, the threshold encryption is a defence against an
attack that wasn't really there in the first place. Your
design doesn't change.

### Simple token transfers

Alice sends Bob 100 tokens. The transaction is visible (and
that visibility is fine — anyone can see Alice has sent Bob
tokens, and that's not extractable value). No sandwich, no
front-run; nothing to extract. The encryption doesn't hurt,
but the property it protects isn't relevant here.

### NFT mints (open mint, no whitelist)

An open-mint NFT where anyone can mint until a cap is reached:
the only MEV is "be the first to call mint when minting opens",
and that's a different problem (a launch-rush problem). The
encryption doesn't help directly.

### Static parameter reads

Reading `total_supply()` or `balance_of(addr)` from a token —
just a query. No state change, no ordering concern. The
encryption is orthogonal.

### Multisig signature collection

A multisig collects signatures for a proposed action and
executes when threshold is reached. The signatures themselves
might be sensitive, but the *execution* of the multisig (the
final on-chain call) is not particularly MEV-exposed — the
proposal already exists on-chain by then.

## The middle ground

Some contracts benefit *partly*:

### Token contracts with airdrops

A claim-based airdrop where the first N claimants get a bonus:
the order in which claims arrive matters. Threshold encryption
removes the ability of validators to reorder claims; whether
that's the right design depends on the airdrop's mechanics.

### Voting where the count is the outcome

If a vote's outcome depends on the total count (a quorum
threshold), and a transaction can be observed before being
included, an attacker might race to include a vote that
flips the outcome. Encryption helps; the magnitude depends
on the voting system.

### Bridge contracts

Bridges that lock assets on one chain and mint on another
have an internal ordering — the mint must come after the
lock confirmation. Encryption on the destination chain might
help, depending on the bridge's mechanism.

## A design checklist

For a new contract, ask:

1. **Does my contract's correctness depend on the order of
   transactions that touch it?** If yes, threshold
   encryption probably matters.
2. **Could a participant in my contract benefit from knowing
   what other participants are about to do?** If yes,
   threshold encryption probably matters.
3. **Does my contract have a "first-to-act" advantage?** If
   yes, threshold encryption changes the dynamic.

If the answer to all three is "no", you can design your
contract without thinking about MEV — the chain handles it,
or the question doesn't apply.

If the answer to any is "yes", consider how your design uses
the property. Often the answer is to *simplify*: drop
defensive patterns (commit-reveal, TWAP oracles, generous
slippage) that exist purely to defend against MEV. With the
chain handling that defence, the contract's logic gets
shorter.

## A note on the trust assumption

The threshold-encryption guarantee assumes the committee is
honest: at most 1/3 of validators colluding cannot decrypt
ahead of the ordering, and the ordering itself cannot be
manipulated based on content. If 2/3 of the committee
collude, they *can* decrypt early, and the guarantee fails.

Pyde's committee selection (covered in the protocol
documentation, not this book) is designed to make 2/3-
collusion expensive — economically and reputationally. The
threshold-encryption guarantee is *as strong as* the
committee's honesty.

This is the same trust assumption that secures the chain's
finality. If the committee is honest enough to commit blocks
correctly, it's honest enough to keep encryption keys safe
until the decryption ceremony.

## Summary

Threshold encryption matters most for DEXes, auctions, oracle
updates, and liquidation triggers — contracts where the order
in which transactions execute is itself extractable. It matters
less for simple transfers, NFT mints, and queries. The
language doesn't change either way; the *design choices* you
make for the high-value categories simplify when MEV defence
moves from the contract to the chain.

That's the end of the runtime chapters. The remaining
chapters of the book are the two project chapters
([Multisig](ch17-00-project-multisig.md) and
[Mini-DEX](ch18-00-project-dex.md)) and the appendices.
