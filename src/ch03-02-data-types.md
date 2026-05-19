# Data Types

Every value in Otigen has a particular *data type*, which tells
Otigen what kind of data is being specified so it knows how to work
with that data. We'll look at two data type subsets: scalar and
compound. Compound types — tuples, arrays, structs, enums, vectors,
and maps — get their own chapters; this section covers the *scalar*
types you'll use in almost every contract.

Keep in mind that Otigen is a *statically typed* language, which
means that it must know the types of all variables at compile time.
The compiler can usually infer what type we want to use based on the
value and how we use it. In cases where many types are possible,
you'll need to add a type annotation, like this:

```otigen
let guess: u32 = 42;
```

If we didn't add the `: u32` type annotation here, Otigen would
default this literal to a `u256` — the widest integer Otigen has —
because storage and arithmetic on token-sized values are the common
case in contracts. To get a different integer width, ask for it.

## Scalar Types

A *scalar* type represents a single value. Otigen has four primary
scalar categories: integers, booleans, addresses, and text/byte
sequences.

### Integer Types

An *integer* is a number without a fractional component. Otigen has
twelve built-in integer types:

| Width   | Signed | Unsigned |
|---------|--------|----------|
| 8-bit   | `i8`   | `u8`     |
| 16-bit  | `i16`  | `u16`    |
| 32-bit  | `i32`  | `u32`    |
| 64-bit  | `i64`  | `u64`    |
| 128-bit | `i128` | `u128`   |
| 256-bit | `i256` | `u256`   |

Each variant is either *signed* or *unsigned* and has an explicit
size. *Signed* and *unsigned* refer to whether it's possible for the
number to be negative — in other words, whether the number needs to
have a sign with it (signed) or whether it will only ever be
positive and can therefore be represented without a sign (unsigned).
Signed numbers are stored using two's complement representation.

Each signed variant can store numbers from −(2ⁿ⁻¹) to 2ⁿ⁻¹−1
inclusive, where *n* is the number of bits the variant uses. So an
`i8` can store numbers from −128 to 127. Unsigned variants can
store numbers from 0 to 2ⁿ−1, so a `u8` can store numbers from 0 to
255.

The natural default for contract work is `u256`. Token balances,
address-shaped values, gas prices, and hash outputs are all 256-bit
quantities. Smaller widths exist for the cases where you need them
— a `u8` boolean flag inside a packed event payload, a `u32` for a
small array index — but reach for `u256` when you don't have a
specific reason to choose narrower.

You can write integer literals in two forms:

| Number literals | Example       |
|-----------------|---------------|
| Decimal         | `98_222`      |
| Hex             | `0xFF`        |

Note that underscores can be used as a visual separator and the
compiler ignores them: `1_000_000` is just `1000000`. If you need to
fix the type of a literal explicitly, append the type as a suffix:

```otigen
let supply = 1_000_000_000u256;
let small  = 0u8;
```

The suffix matters when context can't decide for you (calling a
function whose argument is `u64`, but the literal would otherwise
default to `u256`).

#### Checked arithmetic

When you're compiling in any mode, Otigen includes checks for integer
overflow that cause your contract to *revert* the transaction if
overflow occurs. There's no `unchecked { … }` block. This is one of
the most consequential pieces of Otigen's safety-by-default design.
We'll come back to it in [Chapter 11](ch11-00-checked-arithmetic.md).

### The Boolean Type

As in most other programming languages, a Boolean type in Otigen has
two possible values: `true` and `false`. Booleans are one byte in
size. The Boolean type in Otigen is specified using `bool`. For
example:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let t = true;
        let f: bool = false; // with explicit type annotation
    }
}
```

The main way to use Boolean values is through conditionals, such as
an `if` expression. We'll cover how `if` expressions work in Otigen
in [Control Flow](ch03-05-control-flow.md).

### The Address Type

An `Address` is the 32-byte identifier of an account on the Pyde
network. Every transaction has a sender address. Every contract has
its own address. Tokens are owned by addresses. You'll handle
addresses constantly.

```otigen
let me:   Address = msg.sender;
let zero: Address = Address::ZERO;
```

`Address::ZERO` is the conventional sentinel for "no address" — it's
the all-zeros 32-byte value. It's commonly used in events like
`Transfer { from: Address::ZERO, to: recipient }` to mean "minted
from nowhere".

Two addresses compare for equality with `==` and `!=`. Otigen does
not implicitly convert between `Address` and integer types. To
materialise a specific address from a hex literal, write a 256-bit
hex value and cast it to `Address` with the `as` keyword:

```otigen
let team: Address = 0xa1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4 as Address;
```

You'll mostly see this form in deployment scripts and constants —
contract code itself almost never hard-codes addresses, because the
addresses it cares about are passed in as parameters or computed
from `msg.sender`. Inside tests, the canonical way to get a
non-zero address is the `vm.makeAddr(seed)` cheatcode from
`std::vm`, which derives a deterministic test address from a `u64`
seed.

### Strings and Bytes

Otigen has two text-like scalar types: `String` and `bytes`. The
`String` type holds UTF-8 text:

```otigen
let label: String = "Hello, Otigen!";
```

Strings are immutable values (you can't mutate individual characters
in place) and pass through ABI boundaries by copy. The literal form
uses double quotes; escape sequences `\n`, `\t`, `\r`, `\\`, `\"`,
`\0`, and `\xHH` (single hex byte) are supported.

The `bytes` type holds an arbitrary byte sequence — most often used
as the calldata of a low-level call or the return value of one.

```otigen
let data: bytes = msg.data;
```

You'll usually meet `bytes` for the first time when we get to
[`raw_call!`](ch10-03-raw-call.md) in Chapter 10. Until then, you
can leave it in the toolbox.

### Built-in Globals

Otigen exposes several values to every function automatically.
You've already seen `msg.sender` in [Chapter 2](ch02-00-counter-project.md).
Here's the complete list. We won't cover them all in depth — the
appendix has the full reference — but knowing they exist will save
you from re-implementing them.

| Global           | Type      | What it is                                  |
|------------------|-----------|---------------------------------------------|
| `msg.sender`     | `Address` | The address that called this function       |
| `msg.value`      | `u256`    | Native value (PYDE) sent with the call. Only readable inside `#[payable]` and `#[constructor]` |
| `msg.data`       | `bytes`   | The raw calldata                             |
| `block.height`   | `u64`     | The wave-commit index of the current block  |
| `block.timestamp`| `u64`     | Seconds since the Unix epoch, consensus-set |
| `block.anchor`   | `Address` | Address of the anchor committee member      |
| `tx.gas_price`   | `u256`    | The base fee at submission                  |
| `tx.nonce`       | `u64`     | The sender's nonce                          |
| `tx.hash`        | `u256`    | The transaction hash                        |
| `tx.gas_limit`   | `u64`     | The sender's gas limit                      |
| `address(self)`  | `Address` | The current contract's own address          |
| `gas_remaining()`| `u64`     | Gas left in the current execution context   |

A small detail: there is no `tx.origin`. Solidity exposes it for
historical reasons; Otigen omits it deliberately. The reasons are
covered in [Chapter 15](ch15-00-access-control.md), but the short
version is that authentication-against-`tx.origin` is a common
phishing vector, and excluding the global is the cleanest way to
prevent the pattern.

## Compound Types

*Compound types* can group multiple values into one type. Otigen has
six compound forms: tuples, arrays, vectors, maps, structs, and
enums. We'll cover them in the chapters that follow:

* [Tuples and arrays](ch03-03-functions.md#tuples) appear in the
  next two sections as we need them.
* [Maps and storage](ch04-00-storage-and-maps.md) get a chapter of
  their own in Part II.
* [Structs and enums](ch05-00-structs-enums.md) get a chapter in
  Part II as well.

If you're impatient, the cheat sheet is: `(u64, Address)` is a
tuple of a `u64` and an `Address`; `[u8; 32]` is a fixed-length
array of 32 `u8`s; `Vec<u256>` is a dynamic vector; `Map<K, V>` is a
storage-only key-value table; `struct` and `enum` are user-defined
products and sums.

## Summary

Otigen is statically typed; everything has a type the compiler
either infers or you annotate. The scalar types are: twelve integer
sizes (signed and unsigned, 8 through 256 bits), `bool`, `Address`,
`String`, and `bytes`. Every function has access to a small set of
context globals (`msg`, `block`, `tx`, `address(self)`,
`gas_remaining()`).

The [next section](ch03-03-functions.md) covers how to package
these types into functions you can call.
