# Cross-Contract Calls

Contracts compose. A DEX calls token contracts; a multisig calls
arbitrary targets; a governance contract calls the protocol it
governs. The ability of one contract to invoke another is what
turns smart contracts from isolated programs into a *system*.

Otigen offers four mechanisms for cross-contract communication:

- **`interface`** — declare the shape of another contract's ABI
  so you can call it with type safety.
- **`Interface::at(address)`** — given an interface declaration
  and a target address, get a typed handle you call methods on.
- **`raw_call!`** — the low-level escape hatch for when you need
  manual control over the call's calldata, gas, or failure
  handling.
- **`deploy!`** — deploy a new contract from inside a contract.

The four chapters that follow take them one at a time. By the
end, you'll know how to call a token contract you wrote, how to
forward an arbitrary call through a proxy, and how a factory
contract deploys its children.
