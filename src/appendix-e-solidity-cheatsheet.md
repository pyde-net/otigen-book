# Appendix E — Otigen for Solidity developers

A side-by-side reference for translating common Solidity
idioms to Otigen. The left column is Solidity (assume 0.8+);
the right column is Otigen.

## Contract shape

```solidity
// Solidity
pragma solidity ^0.8.20;

contract MyContract {
    uint256 public count;

    function increment() public {
        count += 1;
    }
}
```

```otigen
// Otigen
contract MyContract {
    storage {
        count: u256,
    }

    #[view]
    pub fn get_count() -> u256 {
        return self.count;
    }

    pub fn increment() {
        self.count = self.count + 1;
    }
}
```

Otigen has no `public` keyword that *also* generates a getter
— you write the getter explicitly. The `public` modifier on
state variables in Solidity is convenience; Otigen prefers
explicit.

## State variables

```solidity
mapping(address => uint256) public balances;
mapping(address => mapping(address => uint256)) public allowances;
```

```otigen
storage {
    balances: Map<Address, u256>,
    allowances: Map<Address, Map<Address, u256>>,
}
```

Otigen's `Map<K, V>` is the same concept as Solidity's
`mapping`, with explicit type-parameter syntax.

## Function visibility and view

```solidity
function balanceOf(address owner) external view returns (uint256) {
    return balances[owner];
}
```

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];
}
```

`external`/`public` collapse to `pub` in Otigen. `view`/`pure`
collapse to `#[view]`. The `returns (uint256)` clause becomes
`-> u256`. The function naming follows `snake_case` rather
than `camelCase`.

## Modifiers vs internal functions

Solidity has *modifiers*:

```solidity
modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
}

function setFee(uint256 fee) public onlyOwner {
    feeBps = fee;
}
```

Otigen has no modifier system. Use internal functions:

```otigen
fn require_owner() {
    require!(msg.sender == self.owner, NotOwner { caller: msg.sender });
}

pub fn set_fee(fee: u256) {
    self.require_owner();
    self.fee_bps = fee;
}
```

The trade-off: slightly more verbose at call sites (one extra
line), but the discipline is identical to anything else you
do — there's no special "modifier" syntax to learn.

## Events

```solidity
event Transfer(address indexed from, address indexed to, uint256 amount);

emit Transfer(msg.sender, to, amount);
```

```otigen
event Transfer {
    #[indexed]
    from: Address,
    #[indexed]
    to: Address,
    amount: u256,
}

emit Transfer { from: msg.sender, to: to, amount: amount };
```

Otigen uses braces and named fields rather than parentheses
and positional arguments. The `#[indexed]` attribute replaces
the `indexed` keyword.

## Errors

```solidity
error InsufficientBalance(uint256 available, uint256 required);

if (balance < amount) revert InsufficientBalance(balance, amount);
```

```otigen
error InsufficientBalance { available: u256, required: u256 }

if balance < amount {
    revert!(InsufficientBalance { available: balance, required: amount });
}
// Or more compactly:
require!(balance >= amount, InsufficientBalance {
    available: balance,
    required: amount,
});
```

`require!` accepts typed errors directly; `revert!` is the
unconditional form.

**Important**: do *not* pass string messages to `require!` —
the current Otigen lowerer silently drops them. Always use a
typed error.

## Reentrancy guards

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    function withdraw() external nonReentrant {
        ...
    }
}
```

```otigen
// Otigen has reentrancy guards on by default.
contract Vault {
    pub fn withdraw() {
        // guard is auto-inserted; no annotation needed.
        ...
    }
}
```

Otigen's default is on; you'd add `#[reentrant]` to *disable*
the guard for a specific function. See
[Chapter 9](ch09-00-reentrancy.md).

## Arithmetic

```solidity
unchecked {
    return a + b;     // explicit wrap
}
```

```otigen
// Otigen has no `unchecked` block.
// For wrapping, use bitwise ops or modular reduction:
let result = ((a as u128) + (b as u128) & 0xFFFFFFFFFFFFFFFF) as u64;
```

See [Chapter 11.2](ch11-02-wrapping.md).

## Calls to other contracts

```solidity
interface IToken {
    function transfer(address to, uint256 amount) external;
}

IToken(tokenAddr).transfer(recipient, amount);
```

```otigen
interface IToken {
    fn transfer(to: Address, amount: u256);
}

IToken::at(self.token_addr).transfer(recipient, amount);
```

`IName::at(addr)` is the Otigen idiom; the syntax differs but
the concept is the same.

## Low-level calls

```solidity
(bool ok, bytes memory ret) = target.call{value: amount, gas: 5000}(callData);
```

```otigen
let (ok, ret) = raw_call!(
    target: target,
    calldata: call_data,
    gas: 5_000,
    value: amount,
);
```

## Sending value

```solidity
payable(recipient).transfer(amount);  // 2300 gas
recipient.call{value: amount}("");    // all gas
```

```otigen
// Otigen has one form: raw_call! with empty calldata.
raw_call!(target: recipient, calldata: b"", gas: 5_000, value: amount);
```

## Constructor

```solidity
constructor(string memory name_, uint256 supply_) {
    name = name_;
    totalSupply = supply_;
}
```

```otigen
#[constructor]
pub fn init(name: String, supply: u256) {
    self.name = name;
    self.total_supply = supply;
}
```

Otigen's constructor is just a function with `#[constructor]`;
the conventional name is `init`.

## Block / message globals

| Solidity              | Otigen              |
|-----------------------|---------------------|
| `msg.sender`          | `msg.sender`        |
| `msg.value`           | `msg.value`         |
| `msg.data`            | `msg.data`          |
| `block.number`        | `block.height`      |
| `block.timestamp`     | `block.timestamp`   |
| `block.coinbase`      | `block.anchor`      |
| `tx.gasprice`         | `tx.gas_price`      |
| `tx.origin`           | *not available*     |
| `gasleft()`           | `gas_remaining()`   |
| `address(this)`       | `address(self)`     |
| `address(0)`          | `Address::ZERO`     |
| `keccak256(...)`      | `hash(...)` (Poseidon2, not Keccak) |

The two consequential differences:

- **No `tx.origin`.** Otigen omits it entirely. The
  authentication-against-`tx.origin` pattern is a phishing
  vector, and excluding the global is the cleanest defence.
- **`hash(...)` uses Poseidon2**, not Keccak-256. ZK-friendly,
  much cheaper in-circuit. Outputs are also `u256`, same
  width as Keccak.

## Test setup

```solidity
// Foundry-style test
import "forge-std/Test.sol";

contract MyTest is Test {
    function setUp() public { ... }
    function test_increment() public {
        ...
    }
}
```

```otigen
use my_project::Counter;

contract CounterTest {
    #[test]
    fn test_increment() {
        let c = deploy!(Counter);
        c.increment();
        assert!(c.get_count() == 1);
    }
}
```

Tests are `#[test] fn` (note: not `pub fn`) inside a contract.
The `deploy!` macro spins up a fresh instance per test;
state doesn't bleed between tests.

For expected-revert tests:

```solidity
function test_overdraw_reverts() public {
    vm.expectRevert(InsufficientBalance.selector);
    token.transfer(other, 1_000_000);
}
```

```otigen
#[test]
#[should_panic(expected = "InsufficientBalance")]
fn test_overdraw_reverts() {
    let token = deploy!(Token, ...);
    token.transfer(other, 1_000_000);
}
```

The Rust-Book-style `#[should_panic]` replaces Foundry's
`vm.expectRevert`.

## Spoofing `msg.sender` in tests

```solidity
vm.prank(alice);
token.transfer(bob, 100);
```

```otigen
let vm_h = Vm::at(0xCC...CC as Address);
vm_h.prank(alice);
token.transfer(bob, 100);
```

The cheatcode pattern is the same — the surface is just an
`interface Vm` you call methods on, with the well-known
cheatcode-address derived from `0xCC...CC`.

## Deploying

```sh
# Foundry
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC

# Otigen
wright script script/Deploy.oti:Deploy --network devnet
```

Same shape, different binary name.

## Summary

Most Solidity idioms have a one-line Otigen equivalent. The
biggest mental shifts are:

- **Storage as a typed block**, not slot-numbered state
  variables.
- **Errors as struct types**, declared in source and
  carried in revert data.
- **Reentrancy on by default**, opt out with `#[reentrant]`.
- **No `tx.origin`** — the global doesn't exist.
- **`hash(...)` is Poseidon2**, not Keccak-256.
- **Tests are contract functions with `#[test]`**, ran via
  `wright test` against an embedded PVM.

The vocabulary is different in places; the *shape* of what
you're writing is the same.
