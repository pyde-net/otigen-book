# `deploy!`

`deploy!` is the macro that deploys a contract from inside
another contract. It's the mechanism behind factory contracts
(create a new market, a new pool, a new vault on demand) and
behind deployment scripts (push a contract to a network and get
its address back).

The basic shape is `deploy!(ContractName, args...)`:

```otigen
let token = deploy!(Token, "Pyde", 9, 1_000_000_000);
```

The returned value is a *typed contract handle* (`Contract<Token>`)
that behaves like an `Interface::at` handle for the newly deployed
contract.

## What `deploy!` does

When the runtime executes `deploy!`, it:

1. Allocates a fresh address for the new contract.
2. Loads the contract's bytecode (the compiler bundles the
   bytecode of every contract that `deploy!` references).
3. Runs the constructor with the provided arguments. `msg.sender`
   inside the constructor is the *current contract* (the one
   running `deploy!`), and `msg.value` is whatever you attached
   with `value:`.
4. If the constructor succeeds, returns the new address (wrapped
   in a typed handle).
5. If the constructor reverts, the whole transaction unwinds.

The deployment is a *sub-call* of the current transaction. If
the outer transaction reverts later, the deployment rolls back too
— the address is reclaimed, and the contract effectively never
existed.

## Calling deploy with no constructor arguments

If the contract has no constructor (or a constructor with no
arguments), call `deploy!` with just the contract name:

```otigen
let counter = deploy!(Counter);
```

If you provide arguments but the contract has no constructor, the
compiler refuses. If you provide the wrong number or type of
arguments, the compiler refuses too — `deploy!` is type-checked
against the destination's constructor signature.

## Attaching value to deployment

If the constructor wants to receive native PYDE, attach a `value:`
field:

```otigen
let vault = deploy!(Vault, owner_addr, value: 1_000_000);
```

Inside the constructor, `msg.value` reads back `1_000_000`. The
PYDE is taken from the *deploying contract's* balance, not from
some external pool. If the deployer doesn't have enough PYDE, the
deploy reverts.

## Calling methods on the deployed contract

The returned handle is immediately usable:

```otigen
let token = deploy!(Token, "Pyde", 9, 1_000_000_000);

// Same shape as Interface::at — call methods on the handle:
token.transfer(msg.sender, 1_000);
let bal = token.balance_of(msg.sender);
emit TokenDeployed { addr: address(token), initial_supply: 1_000_000_000 };
```

`address(token)` returns the contract's address — useful when you
want to record where you deployed it.

The handle's type is `Contract<Token>`, which means the compiler
knows the deployed contract's *full* public surface (every `pub
fn` in `Token`), not just the methods declared in an interface.
If you call a method that doesn't exist on `Token`, it's a
compile error.

## A factory pattern

The canonical use case for `deploy!` is a factory: a contract
that creates many instances of another contract on demand.

```otigen
contract VaultFactory {
    storage {
        vault_count: u64,
        vaults: Map<u64, Address>,
    }

    event VaultCreated {
        #[indexed]
        owner: Address,
        vault_id: u64,
        vault_addr: Address,
    }

    pub fn create_vault() {
        let id = self.vault_count;
        self.vault_count = id + 1;

        let vault = deploy!(Vault, msg.sender);
        self.vaults[id] = address(vault);

        emit VaultCreated {
            owner: msg.sender,
            vault_id: id,
            vault_addr: address(vault),
        };
    }
}
```

A user calls `create_vault`; the factory deploys a new `Vault`
with the user as owner; the factory records the address and
emits an event. Off-chain tooling indexing `VaultCreated` can
follow every deployed vault.

## Determinism: where does the address come from?

Addresses for `deploy!`-ed contracts are derived from a hash of
the *deployer's address* and a *nonce* (a counter the deployer
maintains). This means the address is predictable for the
deployer: the same factory deploying the same number of children
always produces the same sequence of addresses.

It also means a *different* deployer cannot produce the same
address by deploying the same contract. The address space is
deterministically partitioned by deployer; no two deployers can
land on the same address.

This is the simplest "CREATE" semantics. A more advanced form —
deploy at a *specific* address derived from a salt the deployer
chooses — exists in some chains as "CREATE2", but Otigen's
current `deploy!` uses only the simple nonce-based form.

## Deploying from a script

A deployment script is just a contract that calls `deploy!`:

```otigen
use my_project::Token;
use my_project::Vault;

contract Deploy {
    pub fn run() {
        let token = deploy!(Token, "Pyde", 9, 1_000_000_000);
        let vault = deploy!(Vault, address(token));

        // Wire them up — e.g., approve the vault to spend tokens.
        token.approve(address(vault), 1_000_000_000);
    }
}
```

`wright script script/Deploy.oti:Deploy --network devnet`
runs `Deploy::run()` against the named network. The deployed
contract addresses are printed to the console for the operator
to record. We covered the mechanics in
[Chapter 1.3](ch01-03-hello-wright.md); this section just
notes that the same `deploy!` you use from inside a contract is
the one a script uses too.

## Limits

A few constraints to be aware of:

- **Bytecode size.** Every contract you `deploy!` from has its
  bytecode bundled in the deploying contract's bytecode. Large
  child contracts make the parent larger; very large parents
  might bump up against the chain's max-bytecode limit.
- **Constructor reverts unwind everything.** If the constructor
  reverts (a `require!` fails, an arithmetic overflow), the
  deploy fails, and the outer transaction either propagates the
  revert (if you don't catch it) or sees an empty handle (if you
  used `raw_call!` to encode the deploy manually). Constructors
  should be conservative about what they require.
- **No recursive deploy.** A contract cannot `deploy!` itself
  during its own constructor. Constructors are the one-shot init
  step; recursion at deploy time is a category error.

## Summary

`deploy!(ContractName, args, [value: amount])` deploys a contract
and returns a typed `Contract<T>` handle. The deployment is a
sub-call of the current transaction; the constructor runs with
the current contract as `msg.sender`. Use it for factory patterns
(many instances of a child contract) and for deployment scripts
(many distinct contracts at the start of a network).

That's the end of the cross-contract-calls chapter. The
[next chapter](ch11-00-checked-arithmetic.md) is the last short
one before the project: a deep dive on Otigen's checked
arithmetic — why it's not optional, when wrapping is genuinely
wanted, and what it costs.
