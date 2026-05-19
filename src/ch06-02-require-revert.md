# `require!` and `revert!`

Two macros raise an error: `require!` (conditional) and `revert!`
(unconditional). A third, `assert!`, is a debugging convenience
that reverts with a generic error and no payload. Between them
they cover every failure path you need.

## `require!`

`require!(cond, ErrorValue)` evaluates `cond`; if `cond` is
`false`, the transaction reverts with `ErrorValue` as the revert
data. If `cond` is `true`, execution continues.

<span class="filename">Filename: src/Token.oti</span>

```otigen
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
```

Two requirements, each guarding the next step. If either fires,
the function exits immediately — the storage writes that follow
do not happen, and the revert payload tells the caller why.

The shape is rigid in one way and flexible in another:

- **Rigid**: the second argument must be a struct-literal
  expression with the error name and its fields:
  `ErrorName { field1: value1, field2: value2 }` or `ErrorName
  {}` for an error with no fields. The compiler's lowerer reads
  the struct shape directly out of the macro call.
- **Flexible**: the first argument can be any expression that
  produces a `bool`. Comparisons, logical combinations, function
  calls — anything that ends in a Boolean.

Two patterns that come up often:

**Compose with `&&`** when several conditions all need to hold:

```otigen
require!(
    self.is_open && amount > 0 && to != Address::ZERO,
    InvalidTransfer {},
);
```

**Split into two `require!`s** when the failure modes are
*different*:

```otigen
require!(self.is_open, MarketClosed {});
require!(amount > 0, ZeroAmount {});
require!(to != Address::ZERO, TransferToZeroAddress {});
```

The split form is almost always better. Each `require!`
documents *its own* failure mode, the revert data tells the caller
*which* condition failed, and the source reads as a checklist.

## `revert!`

`revert!(ErrorValue)` reverts unconditionally. Use it inside a
branch that should never have been reached:

```otigen
match self.state {
    State::Open    => { /* normal path */ }
    State::Closing => revert!(MarketClosing {}),
    State::Closed  => revert!(MarketClosed { closed_at: self.closed_at }),
}
```

The same argument rules apply: `revert!` expects a struct-literal
expression with the error name and fields, or `{}` for a no-field
error.

`revert!` is the right tool when you're already inside the failure
branch — there's no condition to check, you just want out with a
specific reason.

## `assert!`

`assert!(cond)` is the lightest-weight option: evaluate `cond`,
revert with a generic "AssertionFailed" payload if false, continue
if true. It carries no error fields.

```otigen
assert!(self.total_supply == self.sum_of_balances());
```

The two cases where `assert!` is appropriate:

1. **Internal invariants you don't expect to fire** — a sanity
   check in a `#[test]`, or a defensive check guarding a
   should-never-happen path. The lack of a structured error is
   acceptable because callers don't normally encounter the
   condition.

2. **Tests**, where you're encoding the post-condition the test
   wants to verify (`assert!(c.get_count() == 1)`). Tests don't
   need typed errors; they need to fail loudly with a stack trace.

For anything a regular user might trigger, declare a typed error
and use `require!` or `revert!`. The cost is one line of
declaration and a clearer story for downstream tooling.

## What about string messages?

Solidity supports both `require(cond, "MSG")` (string) and
`require(cond, CustomError(x, y))` (typed). Otigen *only* supports
the typed form. The macro's lowering reads the second argument
expecting a struct-literal expression — if you pass a string
literal there, the compiler currently treats it as a generic
"Error" payload with no fields, silently dropping the string.

So this:

```otigen
require!(amount > 0, "amount must be positive");  // <-- string ignored!
```

doesn't do what a Solidity developer might expect. The transaction
reverts, yes, but with `Error {}` instead of with the string. The
diagnostic value is lost.

We recommend declaring a typed error for *every* `require!` in
production code. For quick local sanity checks, `assert!(cond)` is
the right tool — it doesn't pretend to carry a message.

## Idioms for clean error handling

A few patterns make the resulting code read clearly.

**Validate inputs first, mutate later.** Every public function
should run its checks before it touches storage. If a check fails
after a write, the write rolls back — but the *gas* is still
spent. Front-loading the checks fails fast and cheaply.

```otigen
pub fn transfer(to: Address, amount: u256) {
    // 1. Validate
    require!(to != Address::ZERO, TransferToZeroAddress {});
    require!(amount > 0, ZeroAmount {});
    let from_bal = self.balances[msg.sender];
    require!(from_bal >= amount, InsufficientBalance {
        available: from_bal, required: amount,
    });

    // 2. Mutate
    self.balances[msg.sender] = from_bal - amount;
    self.balances[to] = self.balances[to] + amount;

    // 3. Emit
    emit Transfer { from: msg.sender, to: to, amount: amount };
}
```

**One `require!` per condition.** Tempting to combine three
checks with `&&`; resist. Each gets its own line so the revert
data tells the caller *which* condition failed.

**Errors close to where they're used.** Declare each error
directly above the function (or function-group) that raises it,
not in a giant block at the top of the contract. Reading the code
top-to-bottom, you see the error declaration first, then the
function that uses it; both are in your eye-line.

## Summary

`require!(cond, Error { … })` is the conditional revert macro
and the most common form. `revert!(Error { … })` is the
unconditional form, used inside branches that should not have
been reached. `assert!(cond)` is the lightweight generic-error
form, appropriate for tests and internal invariants. Only typed
errors carry information through the revert; strings as a second
argument are silently dropped.

The [next section](ch06-03-decoding-revert.md) covers what
happens to the error *after* it leaves your contract — how a
caller reads the revert payload and how the encoding works.
