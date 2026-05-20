# Project — A Fungible Token

It's time to build something real. In this chapter we'll design,
implement, and test a *fungible token* contract from scratch. The
shape will be familiar — name, symbol, decimals, total supply,
balances, transfers, allowances — the ERC-20 standard that most
EVM tokens follow. The point of the chapter is not to teach you
what a token does; you know that. The point is to assemble
everything from Chapters 1–11 into a working, tested contract you
could deploy.

By the end you will have:

- A `PydeToken` contract with the full ERC-20-style surface.
- Three typed errors that downstream tooling can decode.
- Three events that off-chain indexers can subscribe to.
- A test suite that covers transfers, approvals, and the
  expected-revert cases.

The chapter walks the implementation step by step. We start
small and add capabilities incrementally; each step ends in a
contract that builds, and the next step extends it.

## 12.1 Setting up the project

If you don't already have a project ready, scaffold one with
`wright`:

```sh
$ wright init pyde_token
$ cd pyde_token
$ rm src/Counter.oti test/Counter.test.oti
$ touch src/Token.oti test/Token.test.oti
```

We removed the `Counter` starter; the rest of the scaffold
(`pyde.toml`, `lib/@std`) stays.

## 12.2 The minimum viable token

Start with the smallest contract that can plausibly be called a
token: a name, a total supply, a balance map, and a `transfer`
function. No events, no errors, no allowances. We'll add those.

<span class="filename">Filename: src/Token.oti</span>

```otigen
contract PydeToken {
    storage {
        name: String,
        symbol: String,
        decimals: u8,
        total_supply: u256,
        balances: Map<Address, u256>,
    }

    #[constructor]
    pub fn init(name: String, symbol: String, decimals: u8, initial_supply: u256) {
        self.name = name;
        self.symbol = symbol;
        self.decimals = decimals;
        self.total_supply = initial_supply;
        self.balances[msg.sender] = initial_supply;
    }

    pub fn transfer(to: Address, amount: u256) {
        let from_bal = self.balances[msg.sender];
        self.balances[msg.sender] = from_bal - amount;
        self.balances[to] = self.balances[to] + amount;
    }
}
```

<span class="caption">Listing 12-1: minimum viable token</span>

Build it:

```sh
$ wright build
   Compiling Token.oti
   Wrote out/PydeToken.json
```

It compiles. It even sort-of works: the deployer gets the
initial supply, and `transfer` moves balances around. But it has
serious problems.

**Problem 1: Sending to the zero address vanishes the tokens.**
`self.balances[Address::ZERO]` is a valid map entry; tokens sent
there are *gone*. We need to forbid the zero address as a
destination.

**Problem 2: Overdrawing doesn't return a useful error.** If
`amount > from_bal`, the subtraction reverts with
`ArithmeticOverflow` — but the caller has no idea *why* the
transfer failed.

**Problem 3: There's no record of what happened.** No `Transfer`
event means off-chain tooling has nothing to index.

Let's fix each in turn.

## 12.3 Adding typed errors

Declare error types for the two failure modes:

<span class="filename">Filename: src/Token.oti</span>

```otigen
contract PydeToken {
    storage { /* unchanged */ }

    error InsufficientBalance { available: u256, required: u256 }
    error TransferToZeroAddress {}

    #[constructor]
    pub fn init(...) { /* unchanged */ }

    pub fn transfer(to: Address, amount: u256) {
        require!(to != Address::ZERO, TransferToZeroAddress {});

        let from_bal = self.balances[msg.sender];
        require!(from_bal >= amount, InsufficientBalance {
            available: from_bal,
            required: amount,
        });

        self.balances[msg.sender] = from_bal - amount;
        self.balances[to] = self.balances[to] + amount;
    }
}
```

<span class="caption">Listing 12-2: typed errors for the failure modes</span>

Two `require!` calls now guard the function. If either fires,
the caller sees the typed error in the revert payload — they
know not just *that* the transfer failed but *why*, and for the
balance case, *by how much*.

Note the order of checks: validate the inputs (zero address,
sufficient balance) *before* touching storage. Check-effects-
interactions is a habit; we apply it even in functions that
don't make external calls, because it reads consistently.

## 12.4 Adding the Transfer event

Declare a `Transfer` event with two indexed topics:

<span class="filename">Filename: src/Token.oti</span>

```otigen
event Transfer {
    #[indexed]
    from: Address,
    #[indexed]
    to: Address,
    amount: u256,
}
```

Then update both `init` (to emit a mint event for the initial
supply) and `transfer` (to emit on every move):

```otigen
#[constructor]
pub fn init(name: String, symbol: String, decimals: u8, initial_supply: u256) {
    self.name = name;
    self.symbol = symbol;
    self.decimals = decimals;
    self.total_supply = initial_supply;
    self.balances[msg.sender] = initial_supply;
    emit Transfer { from: Address::ZERO, to: msg.sender, amount: initial_supply };
}

pub fn transfer(to: Address, amount: u256) {
    require!(to != Address::ZERO, TransferToZeroAddress {});
    let from_bal = self.balances[msg.sender];
    require!(from_bal >= amount, InsufficientBalance {
        available: from_bal,
        required: amount,
    });

    self.balances[msg.sender] = from_bal - amount;
    self.balances[to] = self.balances[to] + amount;
    emit Transfer { from: msg.sender, to: to, amount: amount };
}
```

<span class="caption">Listing 12-3: Transfer event on init and transfer</span>

The constructor emits with `from: Address::ZERO` — the canonical
"minted from nowhere" form. Indexers reading the chain see a
mint as `Transfer(Address::ZERO, <recipient>, <amount>)` and a
transfer as `Transfer(<sender>, <recipient>, <amount>)`. One
event type covers both lifecycle moments.

## 12.5 Adding allowances

ERC-20's allowance pattern lets one address authorise another to
spend its balance up to a limit. We need:

- A nested `allowances` map: `owner → spender → limit`.
- An `approve` function that sets a limit.
- A `transfer_from` function that uses the limit.
- An `Approval` event so off-chain tooling can track approvals.
- One more error: `InsufficientAllowance`.

<span class="filename">Filename: src/Token.oti</span>

```otigen
contract PydeToken {
    storage {
        name: String,
        symbol: String,
        decimals: u8,
        total_supply: u256,
        balances: Map<Address, u256>,
        allowances: Map<Address, Map<Address, u256>>,
    }

    event Transfer {
        #[indexed]
        from: Address,
        #[indexed]
        to: Address,
        amount: u256,
    }

    event Approval {
        #[indexed]
        owner: Address,
        #[indexed]
        spender: Address,
        amount: u256,
    }

    error InsufficientBalance { available: u256, required: u256 }
    error InsufficientAllowance { available: u256, required: u256 }
    error TransferToZeroAddress {}

    #[constructor]
    pub fn init(name: String, symbol: String, decimals: u8, initial_supply: u256) {
        self.name = name;
        self.symbol = symbol;
        self.decimals = decimals;
        self.total_supply = initial_supply;
        self.balances[msg.sender] = initial_supply;
        emit Transfer { from: Address::ZERO, to: msg.sender, amount: initial_supply };
    }

    pub fn transfer(to: Address, amount: u256) {
        require!(to != Address::ZERO, TransferToZeroAddress {});
        let from_bal = self.balances[msg.sender];
        require!(from_bal >= amount, InsufficientBalance {
            available: from_bal,
            required: amount,
        });
        self.balances[msg.sender] = from_bal - amount;
        self.balances[to] = self.balances[to] + amount;
        emit Transfer { from: msg.sender, to: to, amount: amount };
    }

    pub fn approve(spender: Address, amount: u256) {
        self.allowances[msg.sender][spender] = amount;
        emit Approval { owner: msg.sender, spender: spender, amount: amount };
    }

    pub fn transfer_from(from: Address, to: Address, amount: u256) {
        require!(to != Address::ZERO, TransferToZeroAddress {});

        let allowance = self.allowances[from][msg.sender];
        require!(allowance >= amount, InsufficientAllowance {
            available: allowance,
            required: amount,
        });

        let from_bal = self.balances[from];
        require!(from_bal >= amount, InsufficientBalance {
            available: from_bal,
            required: amount,
        });

        self.allowances[from][msg.sender] = allowance - amount;
        self.balances[from] = from_bal - amount;
        self.balances[to] = self.balances[to] + amount;
        emit Transfer { from: from, to: to, amount: amount };
    }
}
```

<span class="caption">Listing 12-4: Token with allowances</span>

Three things worth flagging in `transfer_from`:

**The allowance check comes before the balance check.** We
require allowance first because that's the most specific
permission failure: the user said "I don't authorise this
spender to spend this much". If the allowance is fine but the
balance isn't, that's a different reason; the typed errors let
the caller distinguish.

**We deduct from the allowance before the transfer.** This is
the check-effects ordering: write the post-call allowance
*before* the balance changes that might (in a more general
contract) trigger external calls. Token transfers themselves
don't make external calls, but the discipline is consistent.

**We *don't* check `from != Address::ZERO`.** Tokens can come
*from* the zero address — that's the mint pattern — but only the
constructor's `from: Address::ZERO` event represents real
minting. A `transfer_from(Address::ZERO, x, n)` call would fail
because `Address::ZERO` has no allowance to grant; we don't need
a separate check.

## 12.6 Adding view getters

A token's ABI usually includes a handful of read-only views for
off-chain consumers:

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];
}

#[view]
pub fn allowance(owner: Address, spender: Address) -> u256 {
    return self.allowances[owner][spender];
}

#[view]
pub fn get_total_supply() -> u256 {
    return self.total_supply;
}

#[view]
pub fn get_name() -> String {
    return self.name;
}

#[view]
pub fn get_symbol() -> String {
    return self.symbol;
}

#[view]
pub fn get_decimals() -> u8 {
    return self.decimals;
}
```

<span class="caption">Listing 12-5: view getters</span>

Each is marked `#[view]` and serves a query without consuming
gas if called via RPC. Wallets and explorers use these to render
a user's balance and the token's metadata.

## 12.7 Building and testing

The full contract now exists. Build it:

```sh
$ wright build
   Compiling Token.oti
   Wrote out/PydeToken.json
```

And write a test suite. We want to verify:

- Initial supply lands with the deployer.
- A transfer moves balance.
- Sending to the zero address reverts.
- Overdrawing reverts with `InsufficientBalance`.
- Approve sets the allowance.
- `transfer_from` consumes the allowance.
- `transfer_from` without enough allowance reverts.

<span class="filename">Filename: test/Token.test.oti</span>

```otigen
use pyde_token::PydeToken;
use std::vm;

contract TokenTest {
    fn vm_handle() -> Vm {
        return Vm::at(0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC as Address);
    }

    fn fresh_token() -> Contract<PydeToken> {
        return deploy!(PydeToken, "Pyde", "PYDE", 9u8, 1_000_000u256);
    }

    #[test]
    fn deployer_holds_initial_supply() {
        let t = fresh_token();
        assert!(t.balance_of(address(self)) == 1_000_000);
        assert!(t.get_total_supply() == 1_000_000);
    }

    #[test]
    fn transfer_moves_balance() {
        let vm_h = vm_handle();
        let alice = vm_h.makeAddr(1);
        let t = fresh_token();

        t.transfer(alice, 500);

        assert!(t.balance_of(address(self)) == 999_500);
        assert!(t.balance_of(alice) == 500);
    }

    #[test]
    #[should_panic(expected = "TransferToZeroAddress")]
    fn transfer_to_zero_reverts() {
        let t = fresh_token();
        t.transfer(Address::ZERO, 100);
    }

    #[test]
    #[should_panic(expected = "InsufficientBalance")]
    fn transfer_overdraw_reverts() {
        let vm_h = vm_handle();
        let alice = vm_h.makeAddr(1);
        let t = fresh_token();
        t.transfer(alice, 2_000_000); // we only have 1_000_000
    }

    #[test]
    fn approve_sets_allowance() {
        let vm_h = vm_handle();
        let alice = vm_h.makeAddr(1);
        let t = fresh_token();

        t.approve(alice, 1_000);
        assert!(t.allowance(address(self), alice) == 1_000);
    }

    #[test]
    fn transfer_from_consumes_allowance() {
        let vm_h = vm_handle();
        let alice = vm_h.makeAddr(1);
        let bob = vm_h.makeAddr(2);
        let t = fresh_token();

        // We approve alice to spend 1000 of our tokens.
        t.approve(alice, 1_000);

        // Alice transfers 400 of our tokens to bob.
        vm_h.prank(alice);
        t.transfer_from(address(self), bob, 400);

        assert!(t.balance_of(address(self)) == 999_600);
        assert!(t.balance_of(bob) == 400);
        assert!(t.allowance(address(self), alice) == 600);
    }

    #[test]
    #[should_panic(expected = "InsufficientAllowance")]
    fn transfer_from_without_allowance_reverts() {
        let vm_h = vm_handle();
        let alice = vm_h.makeAddr(1);
        let bob = vm_h.makeAddr(2);
        let t = fresh_token();

        vm_h.prank(alice);
        t.transfer_from(address(self), bob, 100); // no allowance
    }
}
```

<span class="caption">Listing 12-6: a test suite for the token</span>

A few patterns worth highlighting:

**Test fixtures via helper functions.** `vm_handle()` and
`fresh_token()` are internal helpers that each test calls to get
a fresh deployment. Sharing the setup keeps each test focused on
its assertions.

**Two patterns for `msg.sender` in tests.** The default
`msg.sender` inside a test is the test contract's own address
(`address(self)`). To simulate a *different* address calling the
token, use `vm_h.prank(alice)` — this spoofs `msg.sender` for
the *next* external call only. We saw this idiom briefly in
[Chapter 2](ch02-00-counter-project.md).

**`#[should_panic(expected = "ErrorName")]`** for the three
revert tests. The expected string matches the error name —
`TransferToZeroAddress`, `InsufficientBalance`,
`InsufficientAllowance` — so a test that reverts with a
*different* error than the one expected still fails. This is
narrower than `#[should_panic]` alone (which accepts any
revert) and pinpoints regressions.

Run the suite:

```sh
$ wright test
  Building contracts...
  PydeToken — compiled
  compiled in 0.01s

  test/Token.test.oti
    PASS deployer_holds_initial_supply (... gas)
    PASS transfer_moves_balance (... gas)
    PASS transfer_to_zero_reverts (... gas)
    PASS transfer_overdraw_reverts (... gas)
    PASS approve_sets_allowance (... gas)
    PASS transfer_from_consumes_allowance (... gas)
    PASS transfer_from_without_allowance_reverts (... gas)

  7 passed, 0 failed, 0 skipped (0.10s)
```

Seven tests, all green. The contract is complete enough to ship.

## 12.8 Deploying the contract

The deployment is a small script:

<span class="filename">Filename: script/Deploy.oti</span>

```otigen
use pyde_token::PydeToken;

contract Deploy {
    pub fn run() {
        let token = deploy!(PydeToken, "Pyde", "PYDE", 9u8, 1_000_000_000u256);
        // The deployer prints the address.
    }
}
```

Run against the local devnet:

```sh
$ wright script script/Deploy.oti:Deploy --network devnet
  Deploying PydeToken to devnet...
  Deployed PydeToken at 0xa1b2c3...
  Deploy complete
```

> **Status note.** `wright script` against `devnet` requires a
> running Pyde node serving JSON-RPC. The post-pivot node is
> being rebuilt against the new consensus; until it ships, the
> script step won't connect anywhere real. The build and test
> steps above don't need a node — `test` runs against the
> embedded PVM in-process.

The address is what you'd hand out to a wallet that wants to
talk to the token.

## 12.9 What we built

Roughly 80 lines of contract code, 60 lines of test, and 8 lines
of deployment script. The contract exposes the full ERC-20-style
surface (`transfer`, `approve`, `transfer_from`, plus six view
getters) and emits two events (`Transfer`, `Approval`) that any
indexer can subscribe to.

Along the way you used:

- **Storage layout** — fields, nested maps, lazy zero
  initialisation. ([Chapter 4](ch04-00-storage-and-maps.md))
- **Events** — declarations, `#[indexed]` topics, `emit`.
  ([Chapter 7](ch07-00-events.md))
- **Errors** — declarations, `require!` and the typed payload
  encoding. ([Chapter 6](ch06-00-errors.md))
- **Function attributes** — `#[constructor]` for one-shot init,
  `#[view]` for getters. ([Chapter 8](ch08-00-attributes.md))
- **Test infrastructure** — `deploy!` for fresh instances,
  `vm_handle()` for cheatcodes, `#[should_panic]` for expected
  reverts. ([Chapter 2](ch02-00-counter-project.md),
  [Chapter 9.2](ch09-02-opting-out.md))

The token doesn't do anything fancy. That's the point. The
ERC-20 shape is well-understood; what's new here is *seeing how
Otigen renders the shape*. The next two project chapters are
more ambitious — Multisig adds signature verification and a
typed action payload, and the Mini-DEX composes two tokens with
threshold-encrypted swaps — but the techniques you used to build
this token transfer directly to those projects.

That's the end of Part IV. The
[next chapter](ch13-00-pvm.md) is the first of Part V, on how
Otigen contracts meet the underlying Pyde runtime — starting
with a tour of the PVM, the virtual machine the bytecode runs
on.
