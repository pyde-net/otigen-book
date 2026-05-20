# Project — A Mini-DEX with Encrypted Swaps

The final project is a *constant-product market maker* — the
shape behind Uniswap V2, the simplest practical decentralised
exchange. Two ERC-20-shaped tokens, a liquidity pool that
holds reserves of each, swaps that move tokens between the
caller and the pool, and LP shares that track each provider's
claim on the reserves.

Compared to the token in [Ch 12](ch12-00-project-token.md) and
the multisig in [Ch 17](ch17-00-project-multisig.md), the DEX
is a *composable* contract — it calls into the two token
contracts repeatedly. It also exercises the more interesting
piece of the runtime: under Pyde's threshold-encryption
pipeline, sandwich attacks are impossible at the chain layer.
The DEX doesn't need huge slippage tolerances to protect
against the kind of MEV that plagues Uniswap.

## 18.1 What we're building

A pool that lets users:

- **Add liquidity** — deposit equal-value amounts of two
  tokens, receive LP shares proportional to the reserves
  they're adding.
- **Remove liquidity** — burn LP shares, withdraw a
  proportional share of each reserve.
- **Swap** — send token A, receive token B, where the
  amount-out is determined by the constant-product formula
  with a small fee for liquidity providers.

The invariant: `reserve_a × reserve_b = k`. Every swap
preserves `k` (modulo the fee); every liquidity event scales
`k` proportionally.

## 18.2 Scaffolding

```sh
$ wright init dex
$ cd dex
$ rm src/Counter.oti test/Counter.test.oti
$ touch src/Pool.oti test/Pool.test.oti
```

We'll assume the two underlying tokens are already deployed
(perhaps with the `PydeToken` contract from
[Ch 12](ch12-00-project-token.md)) and just deal with the pool.

## 18.3 The pool's storage

The pool needs to know two token addresses, the reserves of
each, and the LP share state:

<span class="filename">Filename: src/Pool.oti</span>

```otigen
contract Pool {
    storage {
        token_a: Address,
        token_b: Address,
        reserve_a: u256,
        reserve_b: u256,
        total_lp_shares: u256,
        lp_balances: Map<Address, u256>,
    }

    #[constructor]
    pub fn init(token_a: Address, token_b: Address) {
        require!(token_a != token_b, IdenticalTokens {});
        require!(token_a != Address::ZERO && token_b != Address::ZERO,
                 ZeroTokenAddress {});
        self.token_a = token_a;
        self.token_b = token_b;
    }

    error IdenticalTokens {}
    error ZeroTokenAddress {}
}
```

<span class="caption">Listing 18-1: pool storage</span>

Two design notes:

**Two tokens, not many.** A "pool with N tokens" is harder math
(you need an N-dimensional invariant) and a different design
goal (the StableSwap family). Most production DEXes use
two-token pools and let users compose multi-hop swaps. We do
the same.

**Reserves are tracked separately from the actual token
balances.** The pool's balance of `token_a` (in the token
contract's storage) and `self.reserve_a` (in our storage)
should be equal, but they're tracked in different places.
Keeping them separate lets us *detect* deviations (a
mismatched balance suggests a malicious token, a re-entry, or
a bug) and skim incorrect transfers.

## 18.4 Interfaces

We need to talk to the two underlying tokens. Declare an
interface up front:

```otigen
interface IToken {
    fn transfer(to: Address, amount: u256);
    fn transfer_from(from: Address, to: Address, amount: u256);
    fn balance_of(owner: Address) -> u256;
}
```

We use only three methods from each token: pull tokens from
the user (`transfer_from`), push tokens to the user
(`transfer`), and check what the pool currently holds
(`balance_of`).

## 18.5 Adding liquidity

The shape: the user authorises the pool to pull both tokens
(via `approve` on each token contract, off-chain), then calls
`add_liquidity`. The pool pulls the tokens, mints LP shares,
and updates its reserves.

```otigen
event LiquidityAdded {
    #[indexed]
    provider: Address,
    amount_a: u256,
    amount_b: u256,
    lp_shares_minted: u256,
}

error InsufficientLiquidityProvided {}

pub fn add_liquidity(amount_a: u256, amount_b: u256) -> u256 {
    require!(amount_a > 0 && amount_b > 0, InsufficientLiquidityProvided {});

    let ta = IToken::at(self.token_a);
    let tb = IToken::at(self.token_b);

    // Pull the user's tokens.
    ta.transfer_from(msg.sender, address(self), amount_a);
    tb.transfer_from(msg.sender, address(self), amount_b);

    let shares_to_mint = if self.total_lp_shares == 0 {
        // First liquidity provider: mint shares equal to sqrt(a*b).
        sqrt(amount_a * amount_b)
    } else {
        // Subsequent providers: mint shares proportional to the smaller
        // of the two ratios. This penalises providers who deposit in
        // a different ratio than the current reserves.
        let from_a = (amount_a * self.total_lp_shares) / self.reserve_a;
        let from_b = (amount_b * self.total_lp_shares) / self.reserve_b;
        if from_a < from_b { from_a } else { from_b }
    };

    self.reserve_a = self.reserve_a + amount_a;
    self.reserve_b = self.reserve_b + amount_b;
    self.total_lp_shares = self.total_lp_shares + shares_to_mint;
    self.lp_balances[msg.sender] = self.lp_balances[msg.sender] + shares_to_mint;

    emit LiquidityAdded {
        provider: msg.sender,
        amount_a: amount_a,
        amount_b: amount_b,
        lp_shares_minted: shares_to_mint,
    };

    return shares_to_mint;
}

fn sqrt(x: u256) -> u256 {
    // Babylonian method — Newton-Raphson for square root.
    if x == 0 { return 0; }
    let mut z = (x + 1) / 2;
    let mut y = x;
    while z < y {
        y = z;
        z = (x / z + z) / 2;
    }
    return y;
}
```

<span class="caption">Listing 18-2: add liquidity</span>

A few details to call out:

**The first LP gets `sqrt(a*b)` shares.** This is the standard
Uniswap V2 formula. It's a convention: the *initial* share
count is the geometric mean of the two reserves, which means
the share price starts at 1.

**Subsequent LPs get shares proportional to whichever side
they're scarcest on.** If a user adds 100 token-A and 200
token-B but the reserves are 1000 A and 1500 B (a 1:1.5
ratio), the user is over-providing A relative to the ratio.
Their shares are minted based on the A side (`amount_a /
reserve_a * total_shares`), and the over-provided B sits in the
pool without earning extra share. The user is implicitly
"swapping" their excess B at the current price by donating it.
This penalises off-ratio liquidity provision.

**The reserves update *after* the token pulls.** If a `pull`
reverts (the user hadn't approved enough), the whole function
reverts and the reserves are unchanged.

**The internal `sqrt` is an unrolled Newton-Raphson.** This is
the standard pattern for fixed-point square roots on a chain.
It's a few hundred gas; for production you might factor out the
implementation into a library, but the inline form keeps the
chapter readable.

## 18.6 Swapping

The classic constant-product swap. The fee is built into the
input amount:

```otigen
event Swapped {
    #[indexed]
    swapper: Address,
    #[indexed]
    token_in: Address,
    amount_in: u256,
    amount_out: u256,
}

error InsufficientOutput { min: u256, actual: u256 }
error InvalidToken { provided: Address }

pub fn swap_a_for_b(amount_in: u256, min_out: u256) -> u256 {
    require!(amount_in > 0, ZeroAmount {});

    let ta = IToken::at(self.token_a);
    let tb = IToken::at(self.token_b);

    // Constant-product math: (a + in) * (b - out) = a * b * (1 - fee)
    // where `in` is the gross input and `fee` is built in.
    let fee_bps = 30u256;          // 0.30%
    let fee_denom = 10_000u256;
    let amount_in_after_fee = (amount_in * (fee_denom - fee_bps)) / fee_denom;

    let amount_out = (amount_in_after_fee * self.reserve_b) /
                     (self.reserve_a + amount_in_after_fee);

    require!(amount_out >= min_out,
             InsufficientOutput { min: min_out, actual: amount_out });

    // Pull A from the user, push B back.
    ta.transfer_from(msg.sender, address(self), amount_in);
    self.reserve_a = self.reserve_a + amount_in;
    self.reserve_b = self.reserve_b - amount_out;
    tb.transfer(msg.sender, amount_out);

    emit Swapped {
        swapper: msg.sender,
        token_in: self.token_a,
        amount_in: amount_in,
        amount_out: amount_out,
    };

    return amount_out;
}

// Mirror function for the other direction:
pub fn swap_b_for_a(amount_in: u256, min_out: u256) -> u256 {
    require!(amount_in > 0, ZeroAmount {});

    let ta = IToken::at(self.token_a);
    let tb = IToken::at(self.token_b);

    let fee_bps = 30u256;
    let fee_denom = 10_000u256;
    let amount_in_after_fee = (amount_in * (fee_denom - fee_bps)) / fee_denom;

    let amount_out = (amount_in_after_fee * self.reserve_a) /
                     (self.reserve_b + amount_in_after_fee);

    require!(amount_out >= min_out,
             InsufficientOutput { min: min_out, actual: amount_out });

    tb.transfer_from(msg.sender, address(self), amount_in);
    self.reserve_b = self.reserve_b + amount_in;
    self.reserve_a = self.reserve_a - amount_out;
    ta.transfer(msg.sender, amount_out);

    emit Swapped {
        swapper: msg.sender,
        token_in: self.token_b,
        amount_in: amount_in,
        amount_out: amount_out,
    };

    return amount_out;
}

error ZeroAmount {}
```

<span class="caption">Listing 18-3: swap</span>

The constant-product formula in code: given `reserve_a`,
`reserve_b`, and `amount_in`, the math is `amount_out =
amount_in * reserve_b / (reserve_a + amount_in)`, with a fee
deducted from `amount_in` before the calculation.

**About `min_out`** — this is the slippage protection. The user
calls `swap_a_for_b(1_000, 999)` to mean "swap 1000 of A for
at least 999 of B, or revert". The traditional reason for slack
in `min_out` is to defend against sandwich attacks: the user
expects 1000 → 1000 in a calm market, but allows for getting
as little as 999 to tolerate normal price drift.

Under Pyde's threshold-encryption pipeline (when wired in —
see [Ch 16](ch16-00-threshold-encryption.md)), the sandwich
attack vector vanishes. The user's swap isn't visible to a
sandwicher until after the order is committed; the swap's
slippage is then due *only* to legitimate price drift from
other users' transactions, not from intentional manipulation.
Tighter `min_out` thresholds become safe. The recommendation
once threshold encryption is live: use a smaller slippage
tolerance than you would on a public-mempool chain.

## 18.7 Removing liquidity

The inverse of `add_liquidity`: burn LP shares, withdraw a
proportional amount of each reserve:

```otigen
event LiquidityRemoved {
    #[indexed]
    provider: Address,
    lp_shares_burned: u256,
    amount_a: u256,
    amount_b: u256,
}

error InsufficientLPShares { available: u256, required: u256 }

pub fn remove_liquidity(lp_shares: u256) -> (u256, u256) {
    require!(lp_shares > 0, ZeroAmount {});

    let user_shares = self.lp_balances[msg.sender];
    require!(user_shares >= lp_shares,
             InsufficientLPShares {
                 available: user_shares,
                 required: lp_shares,
             });

    let amount_a = (lp_shares * self.reserve_a) / self.total_lp_shares;
    let amount_b = (lp_shares * self.reserve_b) / self.total_lp_shares;

    self.lp_balances[msg.sender] = user_shares - lp_shares;
    self.total_lp_shares = self.total_lp_shares - lp_shares;
    self.reserve_a = self.reserve_a - amount_a;
    self.reserve_b = self.reserve_b - amount_b;

    let ta = IToken::at(self.token_a);
    let tb = IToken::at(self.token_b);
    ta.transfer(msg.sender, amount_a);
    tb.transfer(msg.sender, amount_b);

    emit LiquidityRemoved {
        provider: msg.sender,
        lp_shares_burned: lp_shares,
        amount_a: amount_a,
        amount_b: amount_b,
    };

    return (amount_a, amount_b);
}
```

<span class="caption">Listing 18-4: remove liquidity</span>

Same check-effects-interactions: update LP balances and
reserves *before* the external token transfers.

## 18.8 View getters

A few read-only methods for off-chain consumers:

```otigen
#[view]
pub fn get_reserves() -> (u256, u256) {
    return (self.reserve_a, self.reserve_b);
}

#[view]
pub fn get_lp_balance(owner: Address) -> u256 {
    return self.lp_balances[owner];
}

#[view]
pub fn get_amount_out(token_in: Address, amount_in: u256) -> u256 {
    let fee_bps = 30u256;
    let fee_denom = 10_000u256;
    let after_fee = (amount_in * (fee_denom - fee_bps)) / fee_denom;
    if token_in == self.token_a {
        return (after_fee * self.reserve_b) / (self.reserve_a + after_fee);
    }
    if token_in == self.token_b {
        return (after_fee * self.reserve_a) / (self.reserve_b + after_fee);
    }
    return 0;
}
```

`get_amount_out` is the *quote* function — given an input
amount, what would the user receive? Wallets call this before
prompting the user, to display the expected output.

## 18.9 Testing

A test suite that exercises the happy paths:

<span class="filename">Filename: test/Pool.test.oti</span>

```otigen
use dex::Pool;
use my_project::PydeToken;
use std::vm;

contract PoolTest {
    fn fresh_setup() -> (Contract<Pool>, Contract<PydeToken>, Contract<PydeToken>) {
        // Deploy two tokens with the test contract holding the supply.
        let ta = deploy!(PydeToken, "TokenA", "TKA", 9u8, 1_000_000u256);
        let tb = deploy!(PydeToken, "TokenB", "TKB", 9u8, 1_000_000u256);
        let pool = deploy!(Pool, address(ta), address(tb));
        // Approve the pool to pull tokens from us.
        ta.approve(address(pool), 1_000_000);
        tb.approve(address(pool), 1_000_000);
        return (pool, ta, tb);
    }

    #[test]
    fn first_liquidity_provider_gets_sqrt_shares() {
        let (pool, _, _) = fresh_setup();
        let shares = pool.add_liquidity(10_000, 40_000);
        // sqrt(10_000 * 40_000) = sqrt(400_000_000) = 20_000
        assert!(shares == 20_000);
    }

    #[test]
    fn swap_obeys_constant_product() {
        let (pool, _, _) = fresh_setup();
        pool.add_liquidity(10_000, 10_000);

        // Swap 1000 A for B. Expected: ~907 B (after 0.30% fee).
        let out = pool.swap_a_for_b(1_000, 900);
        assert!(out > 900 && out < 1_000);

        // Reserves should be (11_000, 10_000 - out).
        let (ra, rb) = pool.get_reserves();
        assert!(ra == 11_000);
        assert!(rb == 10_000 - out);
    }

    #[test]
    #[should_panic(expected = "InsufficientOutput")]
    fn slippage_protection_reverts() {
        let (pool, _, _) = fresh_setup();
        pool.add_liquidity(10_000, 10_000);
        // Require min_out impossibly high.
        pool.swap_a_for_b(1_000, 2_000);
    }

    #[test]
    fn remove_liquidity_returns_pro_rata() {
        let (pool, ta, tb) = fresh_setup();
        let shares = pool.add_liquidity(10_000, 10_000);
        let (out_a, out_b) = pool.remove_liquidity(shares);
        assert!(out_a == 10_000);
        assert!(out_b == 10_000);
        // And the test contract has its tokens back.
        assert!(ta.balance_of(address(self)) == 1_000_000);
    }
}
```

<span class="caption">Listing 18-5: test suite</span>

The setup helper deploys two tokens *and* a pool, with the
test contract holding the supply and the pool authorised to
pull tokens. Subsequent tests focus on the pool's mechanics.

## 18.10 What we built

About 200 lines of contract code that:

- Composes two `PydeToken` instances into a market.
- Maintains the constant-product invariant with a 0.30% fee.
- Mints LP shares proportional to liquidity provided.
- Burns LP shares to withdraw pro-rata.
- Defends against slippage via `min_out`.
- Defends against sandwich attacks via the chain's
  threshold-encryption pipeline (when wired in).
- Follows check-effects-interactions throughout.

This is the design that powers Uniswap V2 — the most
widely-deployed and most-imitated DEX shape in the EVM
ecosystem — rendered in Otigen with the chain's safety
guarantees in the background.

You could extend this in obvious ways:

- **Routing**: a `Router` contract that finds the best path
  for a multi-hop swap.
- **Concentrated liquidity** (Uniswap V3 style): liquidity
  providers pick a price range and earn more fees within it.
- **Protocol fee**: a percentage of the LP fee that goes to
  the protocol's treasury (a multisig from
  [Ch 17](ch17-00-project-multisig.md), maybe).
- **Read-only price oracles**: cumulative-price tracking that
  external contracts can sample.

Each is its own contract, layered on top of the pool. The
shape this chapter built is the *base layer* — the thing
everything else composes against.

## 18.11 End of the projects

You've now built three working contracts: a fungible token, a
multisig wallet, and a DEX. Each used a different cross-section
of the language; together they cover essentially everything
Otigen offers.

If you wanted to ship one of these to a real network, the
work that remains is:

- **External audit.** Smart contracts deserve more eyes than
  the author's. A formal audit catches the subtler bugs the
  type system can't.
- **Deployment scripts.** A real deploy needs to coordinate
  with whoever holds the funding key, who configures the
  initial parameters, who deploys to which network.
- **Monitoring.** Once deployed, the contract runs on its own.
  Off-chain monitors watching for unexpected events and
  unexpected reverts are the operational hygiene every
  protocol needs.

These are the operational layers around the contract; the
contract itself is the kind of thing you've now built three
of.

That's the end of the project chapters and the end of the
narrative arc of the book. The [appendices](appendix-a-keywords.md)
that follow are reference material: keywords, operator
precedence, built-in functions, common compiler errors, a
side-by-side cheatsheet for Solidity developers, and the
tooling reference.

Good luck. Build something.
