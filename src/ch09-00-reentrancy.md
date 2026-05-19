# Reentrancy

Reentrancy is the bug class that drained the DAO in June 2016 and
moved $60 million in ETH out of the contract that held it. It has
recurred in dozens of incidents since, in token contracts, lending
pools, and bridges. It is the single most impactful failure mode
in smart-contract design.

This chapter is about *what reentrancy is*, *what Otigen's default
auto-guard protects you from*, and *what you still have to think
about even with the guard on*. It's a deeper-dive companion to
[Chapter 8.4](ch08-04-reentrant.md), which covered the
`#[reentrant]` attribute as a piece of syntax.

The chapter has three sections:

- [The auto-guard](ch09-01-auto-guard.md) — the mechanism in
  detail, the gas it costs, and what it does and doesn't protect.
- [Opting out](ch09-02-opting-out.md) — when you need to, how to
  do it safely, and the check-effects-interactions discipline that
  replaces the guard.
- [Cross-contract reentrancy](ch09-03-cross-contract.md) — the
  patterns that the guard *can't* see: read-only reentrancy,
  multi-contract chains, callbacks from "safe" tokens that turn
  out not to be.

If you skip this chapter, the auto-guard will still protect you
from the dumbest version of the attack. Reading it gives you the
mental model for the smarter versions.
