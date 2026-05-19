# `interface`

An `interface` declaration is a *type-only* description of another
contract's public surface. It lists method signatures — names,
parameter types, return types — without any implementation. The
declaration is what makes the typed-call form (`IName::at(addr)`)
possible: when you call a method on a typed handle, the compiler
checks the call against the interface's signature, encodes the
calldata correctly, and decodes the return value back into the
right Otigen type.

## Declaring an interface

The syntax is `interface IName { fn name(args) -> Return; ... }`:

<span class="filename">Filename: src/Token.oti</span>

```otigen
interface IToken {
    fn balance_of(owner: Address) -> u256;
    fn transfer(to: Address, amount: u256);
    fn approve(spender: Address, amount: u256);
    fn transfer_from(from: Address, to: Address, amount: u256);
}
```

Each line inside the braces is a method signature, ending in `;`.
A signature has the same shape as a normal `fn` declaration minus
the body and minus `pub` (interfaces only describe public methods,
so the keyword is redundant).

Notice that there are no attributes on the methods — no `#[view]`,
no `#[payable]`. The interface describes the *shape* of the ABI,
not the implementation's properties. When you call the method
through `IToken::at(addr)`, the runtime sends a regular call;
whether the called contract's function is itself a view or a
payable is its own concern.

There is one exception: if you want to *call a payable method with
value*, you use the call-with-value syntax (covered in the
[next section](ch10-02-interface-at.md)). The interface
declaration doesn't need to mark the method as payable; the call
site does.

## Where interface declarations live

The convention is to declare interfaces *at the top of a file*,
above the contract that uses them. They're not scoped to a
contract — an interface is a description, not a member.

```otigen
interface IToken {
    fn transfer(to: Address, amount: u256);
    fn balance_of(owner: Address) -> u256;
}

contract Vault {
    storage { … }

    pub fn deposit(token: Address, amount: u256) {
        // The compiler now knows IToken::transfer takes
        // (Address, u256) and returns nothing.
        IToken::at(token).transfer(address(self), amount);
    }
}
```

You can also put interface declarations in a separate file and
`use` them — useful when many contracts in a project share an
interface (an internal token, a registry contract, an oracle).

## Naming conventions

Interface names are conventionally prefixed with `I`: `IToken`,
`IRouter`, `IPaymaster`. This is a stylistic borrowing from
Solidity and other ABI-driven languages, where the prefix
distinguishes "the type of the thing on-chain" from "my own
contract implementing that thing".

The convention isn't enforced by the compiler. Some codebases drop
the `I` if there's no ambiguity. Most keep it for grep-ability:
`grep -r "IToken" .` finds every file that interacts with the
token, including the interface declaration itself.

## Multiple interfaces, one contract

A real contract often interacts with several other contracts.
Declare each interface for the role it plays:

```otigen
interface IToken {
    fn transfer(to: Address, amount: u256);
    fn balance_of(owner: Address) -> u256;
}

interface IOracle {
    fn current_price(asset: Address) -> u256;
}

interface IGovernor {
    fn current_proposal() -> u256;
}

contract Vault {
    pub fn liquidate(borrower: Address) {
        let price = IOracle::at(self.oracle).current_price(self.base_asset);
        let bal = IToken::at(self.base_asset).balance_of(borrower);
        // ...
    }
}
```

Each interface declares the shape the caller needs to know. The
Vault doesn't need an `IOracle` that lists every method on the
oracle — only the methods Vault actually calls. Keep interfaces
*minimal*: list only the methods you use.

## What an interface signature must match

When you call `IToken::at(addr).transfer(to, amount)`, the runtime
hashes the method name with the FNV-1a selector (see
[Chapter 14](ch14-01-selectors.md)) and sends that selector
followed by the ABI-encoded arguments. The receiving contract
dispatches by selector, decodes the arguments against its own
function signature, and runs the function.

For the call to work, the receiving contract's function must have
the *same name and the same argument types* as the interface
signature. Other properties — visibility (`pub`), attributes
(`#[payable]`, `#[view]`), the function body — don't need to
match.

If they differ:

- **Wrong name** — the selectors don't match; the called contract
  has no function with that selector; the call falls through to
  the fallback (or reverts if there is none).
- **Wrong argument types** — the selectors *might* match (FNV
  hashes the name, not the types), in which case the receiving
  contract decodes garbage arguments and behaves unpredictably.
  This is one of the cases where you actually want the same
  language on both sides.

The fix is to ensure your interface mirrors the deployed
contract's ABI. The simplest way: copy the relevant `pub fn`
signatures verbatim from the implementation, strip the bodies,
and you have your interface.

## Interfaces and the ABI

The contract's `.pyc` artifact records every `interface` the
contract declares in its metadata. This is mostly informational —
the artifact also records the *implementation* of every method
the contract itself exposes — but tooling that audits cross-
contract dependencies (a build that flags "this contract calls a
method that no deployed contract implements") reads the interface
list.

## Summary

`interface IName { fn signature; ... }` declares the shape of
another contract's public methods you intend to call. The
declaration lives at file level, conventionally prefixed with
`I`, and lists only the methods this caller will actually use.
The names and argument types must match the deployed callee; the
visibility and attributes don't.

The [next section](ch10-02-interface-at.md) covers the
construction that turns an interface plus an address into
callable code.
