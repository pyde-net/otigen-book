# Enums and variants

An `enum` defines a closed set of *variants* — named alternatives
that the value can take. Where a struct is a "thing with these
fields", an enum is a "thing that's *either A or B or C*". Status
fields, lifecycle states, options that the user picks one of:
these are enums.

## Declaring an enum

The syntax is `enum Name { Variant1, Variant2, ... }`:

<span class="filename">Filename: src/Auction.oti</span>

```otigen
contract Auction {
    enum AuctionState {
        Open,
        Closing,
        Closed,
        Cancelled,
    }

    storage {
        state: AuctionState,
        // ...
    }
}
```

Variants are named identifiers, comma-separated, with an optional
trailing comma. There's no payload attached to a variant — Otigen
enums are *C-style*: each variant is just a name, not a tagged
union over additional fields.

If you need an enum-with-data ("this state, with these
parameters"), pair the enum with a struct: a `state: AuctionState`
plus a `params: AuctionParams` storage field, where `params` holds
the variant-specific data. The two-field encoding keeps the enum
small and the parameters typed.

## Reading and writing enum values

Refer to a variant with the qualified path `EnumName::VariantName`:

```otigen
pub fn close(amount: u256) {
    require!(self.state == AuctionState::Open, NotOpen {});
    self.state = AuctionState::Closing;
    // ...
}
```

You can compare enum values with `==` and `!=`, but not with `<` or
`>` — there's no inherent ordering. If you need ordering, write
out the comparison explicitly with `match`.

## Discriminants

Every variant has an integer *discriminant*. The first variant gets
`0`, the second gets `1`, and so on. The discriminant is what the
runtime actually stores in the slot: an `AuctionState` field
occupies one byte (the discriminant), not a wider tagged-union
encoding.

Two consequences:

**The first variant is the zero value.** A storage field of an
enum type defaults to the *first variant you declared*. In our
`AuctionState` example, an auction that hasn't been touched yet
reads back as `AuctionState::Open`. This is why we ordered the
variants the way we did: `Open` is what we want a fresh auction to
be, and putting it first makes lazy zero-initialisation do the
right thing for us.

**Reordering changes wire encoding.** Like with structs, the
declaration order matters once the contract is deployed. Inserting
a variant in the middle shifts every later variant's discriminant
by one, which changes the meaning of any persisted state. Append
new variants at the end; never reorder existing ones.

## Enums in events and errors

Both `event` and `error` declarations can contain enum-typed
fields:

```otigen
event StateChanged {
    #[indexed]
    actor: Address,
    from: AuctionState,
    to: AuctionState,
}

error WrongState { expected: AuctionState, actual: AuctionState }
```

These fields are encoded as their discriminant in the wire format
(again, one byte), and tooling that reads the ABI sees the variant
*names* so it can render `AuctionState::Closing` rather than `1`.

## Casting between enums and integers

Otigen does not implicitly convert between enums and integers, but
you can cast in either direction with `as`:

```otigen
let n: u8 = AuctionState::Closing as u8;     // n is 1
let s: AuctionState = (n as u8) as AuctionState; // back to Closing
```

The integer-to-enum cast traps if the value is out of range — for
example, casting `7u8` to a four-variant enum reverts at runtime.

You'll most often see this when packing enum values into a bitmap
or sending them across an interface boundary that only carries
integers.

## When to use an `enum` vs a `u8`

Two options come up:

```otigen
storage {
    state: AuctionState,    // typed enum
    state_code: u8,         // raw integer
}
```

The enum form is almost always the right one. The reasons:

1. **The match becomes exhaustive.** When you take an enum apart
   with `match` (next section), the compiler refuses to compile if
   you don't handle every variant. With a `u8` you can silently
   skip a case.

2. **Names appear in the ABI.** Indexers and explorers can
   render `AuctionState::Cancelled` rather than `3`.

3. **Adding a state forces a recompile, not a rebug.** Add a new
   variant, and every `match` that switches on the enum forces an
   update.

Reach for a raw integer only when the values are open-ended —
ratings, version numbers, anything where you genuinely cannot
enumerate the legal values at compile time.

## A worked pattern: a state machine

The most common use of an enum is encoding a state machine. The
auction below transitions through three states, with the legal
transitions enforced at the boundary of each public function:

<span class="filename">Filename: src/Auction.oti</span>

```otigen
contract Auction {
    enum State { Open, Closing, Closed }

    error WrongState { expected: State, actual: State }

    storage {
        state: State,
        owner: Address,
        // ...
    }

    fn require_state(want: State) {
        require!(self.state == want, WrongState {
            expected: want,
            actual: self.state,
        });
    }

    #[payable]
    pub fn bid() {
        self.require_state(State::Open);
        // ... bid logic
    }

    pub fn begin_close() {
        require!(msg.sender == self.owner, NotOwner {});
        self.require_state(State::Open);
        self.state = State::Closing;
    }

    pub fn finalise() {
        self.require_state(State::Closing);
        // ... settle, then:
        self.state = State::Closed;
    }
}
```

The `require_state` helper centralises the state check; every entry
point declares the state it requires. A reviewer can read the
state-transition diagram off the source without running it.

## Summary

An `enum` declares a closed set of named variants. Variants are
plain names (no payload); for variant-specific data, pair the
enum with a struct of parameters. Variants have a stable
discriminant in declaration order, so the first variant is the
zero value, and reordering existing variants is a breaking
change.

The [next section](ch05-03-match.md) is the construct that makes
enums *worth using*: the exhaustive `match`.
