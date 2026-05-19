# The `match` control flow

`match` is Otigen's pattern-based branching construct. It's the
right tool for inspecting a value against a *set of possibilities*
— most commonly the variants of an enum, but also against literal
values, ranges, and a catch-all wildcard. `match` is exhaustive,
which is its single most valuable property: the compiler refuses to
let you ship a `match` that doesn't cover every possibility.

## A first example

Here's a function that converts an `AuctionState` to a short
human-readable label:

```otigen
fn label(s: AuctionState) -> String {
    match s {
        AuctionState::Open      => "open",
        AuctionState::Closing   => "closing",
        AuctionState::Closed    => "closed",
        AuctionState::Cancelled => "cancelled",
    }
}
```

The grammar: `match value { pattern => body, ... }`. Each *arm*
is a pattern, a `=>`, and a body expression. Arms are checked top
to bottom; the first pattern that matches the value chooses the
arm. If no pattern matches the value, the program reverts.

But the compiler will not let you get into that state for enum
matches. If we'd written:

```otigen
fn label(s: AuctionState) -> String {
    match s {
        AuctionState::Open    => "open",
        AuctionState::Closing => "closing",
    }
}
```

the compiler would refuse:

```sh
error: non-exhaustive `match`
  --> src/Auction.oti:3:5
   |
 3 |     match s {
   |     ^ patterns `AuctionState::Closed` and `AuctionState::Cancelled`
   |       are not covered
   |
   = help: add the missing arms or a wildcard `_ => ...`
```

This is exhaustiveness checking, and it pays back over the lifetime
of a contract. Add a fifth variant to `AuctionState`, and the
compiler walks you through every `match` in the codebase that needs
to be updated.

## Patterns Otigen supports

Patterns are not full destructuring — Otigen keeps things small.
The available patterns are:

| Pattern         | Example                | Matches                          |
|-----------------|------------------------|----------------------------------|
| Enum variant    | `Mode::Open`           | exactly that variant             |
| Literal         | `42`, `"hi"`, `true`   | exactly that literal value       |
| Range           | `100..200`             | any integer in `[100, 200)`      |
| Wildcard        | `_`                    | anything                         |

There are no variable-binding patterns (Rust's `Some(x) => …`),
because Otigen enums don't carry payloads. There are no
struct-destructuring patterns either; if you need to look at a
struct's fields, dot into them with `self.x.field` after the
match. The minimal pattern grammar is deliberate — it keeps the
exhaustiveness check tractable and the failure modes simple.

### Matching on an integer

```otigen
fn name_grade(score: u8) -> String {
    match score {
        0..50   => "F",
        50..70  => "C",
        70..85  => "B",
        85..101 => "A",
        _       => "out of range",
    }
}
```

When you match on an integer, the compiler can't prove
exhaustiveness on its own (an integer has 2⁸ legal values, not four).
You need a wildcard `_` arm to cover the rest. Forgetting it is the
classic mistake; the compiler reminds you.

### Matching on a literal

```otigen
fn opcode_name(op: u8) -> String {
    match op {
        0x00 => "ADD",
        0x01 => "SUB",
        0x02 => "MUL",
        _    => "unknown",
    }
}
```

Same shape as range matching, but each arm is a single literal.

## `match` as a statement vs an expression

`match` can be used in two ways:

**As a statement** — the body of each arm does work, but the match
itself doesn't return a value:

```otigen
match self.state {
    AuctionState::Open    => self.handle_open(),
    AuctionState::Closing => self.handle_closing(),
    AuctionState::Closed  => self.handle_closed(),
    AuctionState::Cancelled => revert!(AlreadyCancelled {}),
}
```

**As an expression** — every arm produces a value of the same
type, and the whole `match` evaluates to that value:

```otigen
let label = match self.state {
    AuctionState::Open      => "open",
    AuctionState::Closing   => "closing",
    AuctionState::Closed    => "closed",
    AuctionState::Cancelled => "cancelled",
};
```

When you use `match` as an expression, *every* arm must produce a
value of the same type. If one arm returns `"open"` (a `String`)
and another returns `7u64`, the compiler rejects the program with
"incompatible arm types".

## Arms with multi-statement bodies

If an arm needs more than one statement, wrap the body in `{ … }`:

```otigen
match self.state {
    AuctionState::Open => {
        self.state = AuctionState::Closing;
        emit StateChanged { from: AuctionState::Open, to: AuctionState::Closing };
    }
    AuctionState::Closing => {
        // already closing; do nothing
    }
    AuctionState::Closed => revert!(AlreadyClosed {}),
    AuctionState::Cancelled => revert!(AlreadyCancelled {}),
}
```

Arms with `{ … }` bodies *do not* need a separating comma. Single-
expression arms still do.

A common idiom is the empty `{}` body for "do nothing on this
match" — see the `Closing` arm above. There's no implicit "fall
through" in Otigen's `match`; if a variant means "do nothing",
write the empty block explicitly. The intent is then obvious to
the next reader.

## The wildcard pattern, sparingly

The wildcard `_` matches anything not previously matched. It's
required for integer matches, useful for "any other state" fallback,
and almost always *wrong* on an enum — the value of an enum
`match` is that the compiler tells you about new variants. If you
write `_ => …` on an enum match, you've turned off the alarm.

There are two times to use a wildcard on an enum: (1) when you
genuinely want the same behaviour for "all states not explicitly
named here", and (2) in fallback handling of an enum you receive
from another contract that you don't control. Outside those, prefer
exhaustive arms.

## A pattern: deciding a transition

The shape of code that uses `match` well looks like this:

```otigen
contract Auction {
    enum State { Open, Closing, Closed, Cancelled }

    pub fn step() {
        let next = match self.state {
            State::Open      => State::Closing,
            State::Closing   => State::Closed,
            State::Closed    => revert!(NoNextState {}),
            State::Cancelled => revert!(NoNextState {}),
        };

        self.state = next;
        emit StateChanged { to: next };
    }
}
```

The `match` decides the *next state*, then the rest of the function
writes it. Decoupling decision from action makes the code easier
to reason about and easier to test.

## Summary

`match` pattern-matches a value against a fixed set of cases. The
patterns Otigen supports are enum variants, literals, ranges, and
the wildcard `_`. Matches on enums are exhaustive — the compiler
refuses to ship a match that doesn't cover every variant — and
matches on integers must include a `_` arm to cover the rest.
`match` works as both a statement and an expression; when used as
an expression, every arm must return the same type.

That's the end of the structs-and-enums chapter. The
[next chapter](ch06-00-errors.md) covers how a contract
*communicates failure*: the typed errors we've been declaring all
along, plus the `require!` and `revert!` macros that raise them.
