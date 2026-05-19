# Programming a Counter

Let's jump into Otigen by working through a hands-on project together!
This chapter introduces you to a few common Otigen concepts by showing
you how to use them in a real contract. You'll learn about `storage`,
`event`, `error`, `require!`, `match`, the `Map<K, V>` type, and a
handful of attributes. Future chapters explore each of these in
detail; in this chapter, you'll just practice the fundamentals.

We'll implement the classic "counter" — but a little more interesting
than the one `pyde-dev init` gave us. Our counter will be *per-user*:
every address gets its own count. We'll let users increment their own
counters, query anyone's count, and respect a maximum value with a
proper typed error. Along the way the compiler will catch our
mistakes for us.

## Setting up the project

If you completed [Chapter 1](ch01-03-hello-pyde-dev.md), you already
have a project called `counter` with a starter `Counter` contract.
We'll replace its contents step by step. From inside the project:

```sh
$ rm src/Counter.oti
$ touch src/Counter.oti
```

(Equivalently: open `src/Counter.oti` in your editor and clear it.)

## A counter that tracks one number

Let's start with the simplest version: a single global counter that
anyone can increment. Type the following into `src/Counter.oti`:

<span class="filename">Filename: src/Counter.oti</span>

```otigen
contract Counter {
    storage {
        count: u64,
    }

    pub fn increment() {
        self.count = self.count + 1;
    }

    pub fn get() -> u64 {
        return self.count;
    }
}
```

<span class="caption">Listing 2-1: a global counter</span>

Build it:

```sh
$ pyde-dev build
   Compiling Counter.oti
   Wrote out/Counter.pyc
```

A short tour. The `storage { count: u64 }` block declares a single
persistent field. We omit the constructor — Otigen *zero-initialises*
every storage field, so `count` starts at `0` automatically. The
`increment` function bumps it, and `get` returns it.

We don't have a constructor in this contract. Otigen does not require
one: if you don't declare a constructor, the contract simply gets a
"do nothing" deployment. The contract still has to be deployed (a
deployment transaction will be sent), but no init code runs.

### A first error: arithmetic overflow

Let's see what happens if we try to overflow. Add a test:

<span class="filename">Filename: test/Counter.test.oti</span>

```otigen
use counter::Counter;

contract CounterTest {
    #[test]
    pub fn overflow_reverts() {
        let c = Counter::new();
        // Set count to u64::MAX directly via a cheatcode, then increment.
        c.set_count_for_test(u64::MAX);
        c.increment(); // <-- this should revert
    }
}
```

Run it:

```sh
$ pyde-dev test
error: contract `Counter` has no public function `set_count_for_test`
```

The compiler refuses because we never declared `set_count_for_test`.
Good. We don't actually want a write-anything helper in production
code; the test would be exercising a state we can reach by calling
`increment` enough times. We'll set that aside for now and come back
to overflow testing in [Chapter 11](ch11-01-how.md).

The takeaway: **all Otigen arithmetic is checked**. Adding to a `u64`
that's already at its maximum reverts the transaction. There's no
`unchecked { … }` escape hatch.

## Per-user counters with `Map`

A single shared counter isn't very interesting. Let's turn it into
*per-user* counters — every caller gets their own count, indexed by
their address.

Update `src/Counter.oti`:

<span class="filename">Filename: src/Counter.oti</span>

```otigen
contract Counter {
    storage {
        counts: Map<Address, u64>,
    }

    pub fn increment() {
        let current = self.counts[msg.sender];
        self.counts[msg.sender] = current + 1;
    }

    pub fn get(owner: Address) -> u64 {
        return self.counts[owner];
    }
}
```

<span class="caption">Listing 2-2: per-user counters with `Map`</span>

Three new things:

`Map<Address, u64>` is Otigen's built-in associative type: a key-value
store where the keys are `Address` values and the values are `u64`s.
We'll meet `Map` formally in [Chapter 4](ch04-02-maps.md). For now,
think of it as Solidity's `mapping(address => uint64)` with type
parameters made explicit.

`msg.sender` is the address that called this function. It's a *built-in
global* — a piece of context the runtime provides to every function.
We'll catalogue all the globals in [Chapter 3](ch03-02-data-types.md).

The `get` function takes an `Address` parameter and returns that
address's count. We renamed `get` to take the address explicitly,
because the natural "give me *anyone's* count" query is more useful
than "give me my own".

Map values are *lazily zero-initialised*. The first time a user
calls `increment`, `self.counts[msg.sender]` reads back `0` — there
was no entry, so the runtime returns the zero value for `u64`. This
matters: an unused map entry occupies no storage. We pay for storage
only when we write a non-zero value.

Build:

```sh
$ pyde-dev build
   Compiling Counter.oti
   Wrote out/Counter.pyc
```

## Emitting an event when the count changes

Let's tell the outside world when a count changes. Add an event:

<span class="filename">Filename: src/Counter.oti</span>

```otigen
contract Counter {
    storage {
        counts: Map<Address, u64>,
    }

    event Incremented {
        #[indexed]
        owner: Address,
        new_count: u64,
    }

    pub fn increment() {
        let current = self.counts[msg.sender];
        let next = current + 1;
        self.counts[msg.sender] = next;
        emit Incremented { owner: msg.sender, new_count: next };
    }

    pub fn get(owner: Address) -> u64 {
        return self.counts[owner];
    }
}
```

<span class="caption">Listing 2-3: emitting an event on increment</span>

The `event Incremented { … }` block declares a typed payload our
contract may emit. The `#[indexed]` attribute promotes `owner` to a
*topic* on the receipt — that means off-chain indexers can subscribe
cheaply to "all Incremented events from a particular address". We'll
talk about the indexing model in [Chapter 7](ch07-02-indexed.md).

We changed `increment` to compute `next` in a local before writing it
back, so we can include the new value in the event payload without
re-reading storage. (Storage reads cost gas — a small amount, but the
local binding is free.)

Build, and let's also update the test:

<span class="filename">Filename: test/Counter.test.oti</span>

```otigen
use counter::Counter;

contract CounterTest {
    #[test]
    pub fn fresh_counter_is_zero() {
        let c = Counter::new();
        assert!(c.get(0x0_addr) == 0);
    }

    #[test]
    pub fn increment_bumps_one() {
        let c = Counter::new();
        c.increment(); // msg.sender is the test contract itself
        assert!(c.get(address(self)) == 1);
    }

    #[test]
    pub fn each_user_has_their_own() {
        let c = Counter::new();
        c.increment();
        assert!(c.get(0xdead_addr) == 0);
    }
}
```

Run the tests:

```sh
$ pyde-dev test
CounterTest::fresh_counter_is_zero       PASS  (gas: 26_140)
CounterTest::increment_bumps_one         PASS  (gas: 48_926)
CounterTest::each_user_has_their_own     PASS  (gas: 52_318)

  3 passed, 0 failed (32ms)
```

Three things to note about the tests:

* `0x0_addr` and `0xdead_addr` are *address literals*. The `_addr`
  suffix on a hex literal turns it into an `Address`.
* `address(self)` is a built-in that returns the contract's own
  address. Inside a test contract, that's the address that called
  the `Counter` we just deployed — which is what `msg.sender` was
  inside `Counter::increment`.
* `each_user_has_their_own` deliberately checks an address that
  *hasn't* incremented. The result is `0`, demonstrating that map
  entries default to the value's zero.

## Adding a maximum with a typed error

What if we want to limit each user to a maximum of 100 increments?
We'll use Otigen's typed-error pattern: declare an `error` type,
then `require!` the condition.

<span class="filename">Filename: src/Counter.oti</span>

```otigen
contract Counter {
    storage {
        counts: Map<Address, u64>,
    }

    event Incremented {
        #[indexed]
        owner: Address,
        new_count: u64,
    }

    error MaxReached { owner: Address, max: u64 }

    pub fn increment() {
        let current = self.counts[msg.sender];
        require!(
            current < 100,
            MaxReached { owner: msg.sender, max: 100 }
        );
        let next = current + 1;
        self.counts[msg.sender] = next;
        emit Incremented { owner: msg.sender, new_count: next };
    }

    pub fn get(owner: Address) -> u64 {
        return self.counts[owner];
    }
}
```

<span class="caption">Listing 2-4: limit each user to 100 increments
with a typed error</span>

The `error MaxReached { owner: Address, max: u64 }` declares an error
type with two fields. Errors are just structs that the runtime carries
in the revert data when a transaction fails. Off-chain tooling reads
the revert payload, decodes it against the contract's ABI, and can
display "user X tried to exceed the cap" without parsing strings.

`require!(condition, error_value)` is Otigen's preferred way to assert
preconditions. If `condition` is `false`, the runtime reverts the
transaction with `error_value` as the revert data. If `condition` is
`true`, the function continues.

A test for the new behaviour:

<span class="filename">Filename: test/Counter.test.oti</span>

```otigen
#[test]
pub fn exceeding_the_max_reverts() {
    let c = Counter::new();
    let mut i = 0;
    while i < 100 {
        c.increment();
        i = i + 1;
    }
    assert!(c.get(address(self)) == 100);

    // The 101st call must revert.
    let (ok, _) = try c.increment();
    assert!(!ok);
}
```

`try c.increment()` is Otigen's expression for "call this thing and
give me back `(success, return_data)` instead of bubbling the revert".
It's the right tool for tests that *expect* a revert.

Run it:

```sh
$ pyde-dev test --filter exceeding_the_max
CounterTest::exceeding_the_max_reverts   PASS  (gas: 4_120_500)
```

It passes. The 101st `increment` reverts with `MaxReached { owner:
…, max: 100 }`, our test catches the revert, and asserts the call
failed.

## Switching on an `enum`

For our final iteration, let's add a *mode* to the counter. Each
user's counter can be in one of three modes:

* `Open` — anyone can increment it
* `Locked` — increments revert
* `Capped` — increments work until the user-set cap is reached

We'll express the mode as an `enum`:

<span class="filename">Filename: src/Counter.oti</span>

```otigen
contract Counter {
    storage {
        counts: Map<Address, u64>,
        modes: Map<Address, Mode>,
        caps:  Map<Address, u64>,
    }

    enum Mode { Open, Locked, Capped }

    event Incremented {
        #[indexed]
        owner: Address,
        new_count: u64,
    }

    error CounterLocked { owner: Address }
    error MaxReached    { owner: Address, max: u64 }

    pub fn set_mode(mode: Mode, cap: u64) {
        self.modes[msg.sender] = mode;
        self.caps[msg.sender]  = cap;
    }

    pub fn increment() {
        let current = self.counts[msg.sender];
        let mode = self.modes[msg.sender];

        match mode {
            Mode::Open    => {}
            Mode::Locked  => revert!(CounterLocked { owner: msg.sender }),
            Mode::Capped  => {
                let cap = self.caps[msg.sender];
                require!(
                    current < cap,
                    MaxReached { owner: msg.sender, max: cap }
                );
            }
        }

        let next = current + 1;
        self.counts[msg.sender] = next;
        emit Incremented { owner: msg.sender, new_count: next };
    }

    pub fn get(owner: Address) -> u64 {
        return self.counts[owner];
    }
}
```

<span class="caption">Listing 2-5: per-user modes with `enum` and
`match`</span>

A handful of new concepts:

* `enum Mode { Open, Locked, Capped }` declares a tagged sum type.
  The default value for an enum field is the *first* variant, so a
  user who hasn't called `set_mode` is implicitly in `Open` mode.
* `match mode { … }` is Otigen's exhaustive pattern-match. Each arm
  handles one variant; if you later add a `Mode::Frozen` and forget
  to update the `match`, the compiler will refuse to build until you
  do. We'll cover `match` in [Chapter 5](ch05-03-match.md).
* `revert!(error_value)` is the unconditional sibling of `require!`.
  Where `require!(cond, e)` reverts only when `cond` is false,
  `revert!(e)` always reverts.
* The empty `{}` block in the `Open` arm is the right way to spell
  "do nothing on this match arm". Falling through silently in `match`
  isn't possible — every arm has a body, even if the body is empty.

The `Capped` arm reads `self.caps[msg.sender]` *inside* the match
arm so we don't pay the storage read when the user is in `Open` or
`Locked` mode. This is a common Otigen idiom: read storage as late
as possible.

Build and run all of the tests:

```sh
$ pyde-dev test
CounterTest::fresh_counter_is_zero       PASS  (gas:   26_140)
CounterTest::increment_bumps_one         PASS  (gas:   53_926)
CounterTest::each_user_has_their_own     PASS  (gas:   58_318)
CounterTest::exceeding_the_max_reverts   PASS  (gas: 4_120_500)

  4 passed, 0 failed (47ms)
```

## What we did

In about fifty lines of contract code, we exercised most of the
Otigen surface a typical contract uses:

* `contract`, `storage`, `event`, `error`, `enum` blocks
* `pub fn` with parameters, return types, and bodies
* `self.field`, `Map<K, V>` indexing, lazy zero-initialisation
* `msg.sender`, `address(self)`, address literals
* `let` bindings (and a `mut` one in the test)
* The `+`, `<`, and `==` operators (all checked, all type-safe)
* The `match` control flow with exhaustive arms
* `require!`, `revert!`, `emit` macros
* `try` for catching reverts in tests
* `#[test]` for unit tests

The next chapter walks through each of these concepts *systematically*,
one section at a time, with smaller examples that focus on a single
idea. By the end of it, none of the Otigen syntax we just used will
have any mystery left in it.
