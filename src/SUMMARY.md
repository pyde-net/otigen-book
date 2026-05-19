# The Otigen Programming Language

[Foreword](foreword.md)
[Introduction](introduction.md)

## Getting started

- [Getting Started](ch01-00-getting-started.md)
  - [Installation](ch01-01-installation.md)
  - [Hello, Otigen!](ch01-02-hello-otigen.md)
  - [Hello, pyde-dev!](ch01-03-hello-pyde-dev.md)
- [Programming a Counter](ch02-00-counter-project.md)
- [Common Programming Concepts](ch03-00-common-concepts.md)
  - [Variables and Mutability](ch03-01-variables-and-mutability.md)
  - [Data Types](ch03-02-data-types.md)
  - [Functions](ch03-03-functions.md)
  - [Comments](ch03-04-comments.md)
  - [Control Flow](ch03-05-control-flow.md)

## State and types

- [Storage and Maps](ch04-00-storage-and-maps.md)
  - [The storage block](ch04-01-the-storage-block.md)
  - [Maps and nested maps](ch04-02-maps.md)
  - [Slot layout](ch04-03-slot-layout.md)
  - [Lazy allocation and zero values](ch04-04-lazy-allocation.md)
- [Structs, Enums, and Pattern Matching](ch05-00-structs-enums.md)
  - [Defining structs](ch05-01-structs.md)
  - [Enums and variants](ch05-02-enums.md)
  - [The `match` control flow](ch05-03-match.md)
- [Errors and Reverts](ch06-00-errors.md)
  - [The `error` keyword](ch06-01-error-keyword.md)
  - [`require!` and `revert!`](ch06-02-require-revert.md)
  - [Decoding revert data](ch06-03-decoding-revert.md)
- [Events and Logs](ch07-00-events.md)
  - [The `event` keyword](ch07-01-event-keyword.md)
  - [`#[indexed]` topics](ch07-02-indexed.md)
  - [`emit`](ch07-03-emit.md)

## Functions and safety

- [Function Attributes](ch08-00-attributes.md)
  - [`#[view]` and view purity](ch08-01-view.md)
  - [`#[payable]` and `msg.value`](ch08-02-payable.md)
  - [`#[constructor]`](ch08-03-constructor.md)
  - [`#[reentrant]`](ch08-04-reentrant.md)
  - [`#[receive]` and `#[fallback]`](ch08-05-receive-fallback.md)
- [Reentrancy](ch09-00-reentrancy.md)
  - [The auto-guard](ch09-01-auto-guard.md)
  - [Opting out](ch09-02-opting-out.md)
  - [Cross-contract reentrancy](ch09-03-cross-contract.md)
- [Cross-Contract Calls](ch10-00-cross-contract.md)
  - [`interface`](ch10-01-interface.md)
  - [`Interface::at(address)`](ch10-02-interface-at.md)
  - [`raw_call!`](ch10-03-raw-call.md)
  - [`deploy!`](ch10-04-deploy.md)
- [Checked Arithmetic](ch11-00-checked-arithmetic.md)
  - [How it works](ch11-01-how.md)
  - [When wrapping is wanted](ch11-02-wrapping.md)
  - [Gas cost](ch11-03-gas-cost.md)

## A complete project

- [Project: A Fungible Token](ch12-00-project-token.md)

## How Otigen meets the chain

- [The PVM](ch13-00-pvm.md)
  - [Register file](ch13-01-register-file.md)
  - [Instruction set](ch13-02-instruction-set.md)
  - [The call ABI](ch13-03-call-abi.md)
- [The Otigen ABI](ch14-00-abi.md)
  - [Selectors](ch14-01-selectors.md)
  - [The JSON schema](ch14-02-json-schema.md)
  - [Versioning](ch14-03-versioning.md)
- [Access Lists and Parallel Execution](ch15-00-access-lists.md)
  - [Static inference](ch15-01-static-inference.md)
  - [The scheduler's view](ch15-02-scheduler.md)
  - [Dynamic paths and Block-STM](ch15-03-dynamic-paths.md)
- [Threshold-Encrypted Transactions](ch16-00-threshold-encryption.md)
  - [From the user's point of view](ch16-01-user-view.md)
  - [From the contract's point of view](ch16-02-contract-view.md)
  - [When it matters](ch16-03-when-matters.md)

## More projects

- [Project: A Multisig Wallet](ch17-00-project-multisig.md)
- [Project: A Mini-DEX with Encrypted Swaps](ch18-00-project-dex.md)

## Appendices

- [A — Keywords](appendix-a-keywords.md)
- [B — Operator precedence](appendix-b-operators.md)
- [C — Built-in functions and globals](appendix-c-builtins.md)
- [D — Common compiler errors](appendix-d-errors.md)
- [E — Otigen for Solidity developers](appendix-e-solidity-cheatsheet.md)
- [F — Tooling: `otic`, `pyde-dev`, IDE](appendix-f-tooling.md)
