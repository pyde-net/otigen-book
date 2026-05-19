# Foreword

If you've written a smart contract before — anywhere — you already know the
job that Otigen does. A program runs on a public computer that nobody owns.
Its state outlives its author. Its memory is paid for by strangers. Its bugs
cannot be patched without coordinating a network. The room for error is
small, and the room for the wrong kind of cleverness is smaller still.

Otigen is the language we wrote for that job on the Pyde blockchain. It
borrows surface syntax from Rust because Rust's syntax has aged well, but
the language behind the surface is its own thing. Otigen does not try to be
a general-purpose language. It is opinionated about the contract-writing
problem: arithmetic is checked, reentrancy is off by default, storage is
typed, `tx.origin` does not exist, and the compiler tracks which slots each
function touches so the chain can run independent transactions in parallel
without you asking.

This book is the long-form way to learn it. It is written for people who
have shipped Solidity (or Vyper, or any EVM-targeting language) and want to
understand both how Otigen is the same and how it differs. You should be
able to read it linearly and come out the other side able to design,
implement, test, and reason about a non-trivial contract. The three project
chapters — a fungible token, a multisig wallet, and a mini-DEX — exist
because, in the end, no amount of feature reference replaces actually
writing the thing.

We've kept it short where short serves you, and gone deep where the depth
is the point.

— *The Pyde Project*
