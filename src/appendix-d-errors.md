# Appendix D — Common compiler errors

A catalogue of the errors you'll see most often, organised by
what you were probably trying to do. Each entry has the error
message (sometimes paraphrased), a minimal example that
produces it, and the smallest fix.

## Variable and binding errors

### "cannot assign to immutable binding `x`"

```otigen
let x = 5;
x = 6;          // error
```

**Fix**: declare with `let mut`:

```otigen
let mut x = 5;
x = 6;          // ok
```

See [Chapter 3.1](ch03-01-variables-and-mutability.md).

### "`x` is already defined in this scope"

```otigen
let x = 1;
let x = 2;      // error
```

Otigen does not support Rust-style shadowing.

**Fix**: use a different name (`let y = 2;`) or reassign with
`mut`:

```otigen
let mut x = 1;
x = 2;          // ok
```

### "cannot shadow builtin `Vec`"

```otigen
let Vec = 5;    // error
```

Built-in type and global names cannot be shadowed by locals.

**Fix**: rename the local.

## Function errors

### "function `f` is declared to return `T` but the body has no return statement"

```otigen
fn five() -> u64 {
    5     // error — no `return`
}
```

Otigen requires explicit `return` for functions with a return
type.

**Fix**:

```otigen
fn five() -> u64 {
    return 5;
}
```

### "`pub` function `f` is declared inside a contract but the contract is missing `storage`"

Actually, this isn't an error — a contract without `storage`
is valid. But if you reference `self.field` from a function in
a contract that has no `storage` block, the field doesn't
exist:

### "unknown storage field `x`"

```otigen
contract C {
    pub fn run() {
        self.x = 1;  // error — no storage field `x`
    }
}
```

**Fix**: add the field to the `storage` block:

```otigen
contract C {
    storage { x: u64, }
    pub fn run() {
        self.x = 1;
    }
}
```

## View-purity errors

### "`#[view]` function may not write storage"

```otigen
#[view]
pub fn bad() -> u64 {
    self.x = 1;     // error
    return self.x;
}
```

**Fix**: remove the `#[view]` attribute, or move the write out
of this function.

### "`#[view]` function may not emit events"

```otigen
#[view]
pub fn bad() -> u64 {
    emit Something {};   // error
    return 0;
}
```

**Fix**: remove `#[view]` or the `emit`.

### "`#[view]` function calls impure function `helper`"

```otigen
fn helper() {
    self.x = 1;
}

#[view]
pub fn bad() -> u64 {
    helper();           // error — helper mutates
    return 0;
}
```

View purity is transitive.

**Fix**: mark `helper` as `#[view]` (which will fail if
`helper` truly mutates), or remove `#[view]` from `bad`.

## Attribute errors

### "unknown attribute `#[whatever]`"

```otigen
#[whatever]
pub fn f() { }     // error
```

**Fix**: use one of the recognised attributes (`#[view]`,
`#[payable]`, `#[constructor]`, `#[reentrant]`, `#[receive]`,
`#[fallback]`, `#[test]`, `#[indexed]`, `#[should_panic]`).

### "`#[constructor]` and `#[view]` are mutually exclusive"

```otigen
#[constructor]
#[view]
pub fn init() { }   // error
```

**Fix**: drop one. Constructors necessarily mutate state.

### "`#[payable]` may only be used on functions that can receive value"

This fires when you mark a view as payable, or a constructor
as payable. View functions can't receive value (they don't
mutate); constructors are implicitly payable when value is
attached at deploy time.

**Fix**: drop the `#[payable]`.

## Type errors

### "expected `T`, found `U`"

The most common type error. The compiler expected one type
and saw another.

```otigen
let x: u64 = "hello";   // error — String, not u64
```

**Fix**: change the RHS or change the declared type.

### "cannot add `u8` and `u16` directly"

Mixing integer widths.

```otigen
let small: u8 = 5;
let big:   u16 = 100;
let bad = small + big;  // error
```

**Fix**: cast one to the other's width:

```otigen
let ok = (small as u16) + big;
```

### "`Map<K, V>` may only appear in storage"

```otigen
pub fn helper() {
    let m: Map<Address, u64>;   // error
}
```

Maps live only in the `storage` block.

**Fix**: refactor to use `Vec<(K, V)>` for in-memory key-value
needs, or move the map into storage.

## Pattern-match errors

### "non-exhaustive `match`"

```otigen
enum Mode { Open, Closing, Closed }

match mode {
    Mode::Open    => 1,
    Mode::Closing => 2,
}                          // error — `Closed` not covered
```

**Fix**: add the missing arms, or add a wildcard `_`:

```otigen
match mode {
    Mode::Open    => 1,
    Mode::Closing => 2,
    Mode::Closed  => 3,
}
```

### "match arms have incompatible types"

```otigen
let x = match cond {
    true  => 1,
    false => "two",     // error — different type from the true arm
};
```

**Fix**: make both arms return the same type.

## Storage errors

### "expected `,` or `}`, found `=`"

Triggered by an inline initialiser in a storage field:

```otigen
storage {
    count: u64 = 7,    // error
}
```

**Fix**: set the initial value in `#[constructor]`:

```otigen
storage { count: u64, }

#[constructor]
pub fn init() {
    self.count = 7;
}
```

## Emit / event errors

### "unknown event type `E`"

```otigen
emit Transfer { ... };    // error — no event `Transfer` in scope
```

**Fix**: declare the event in the contract, or `use` it from
another module.

### "field `from` of event `Transfer` was not specified"

```otigen
emit Transfer { to: x, amount: n };   // error — missing `from`
```

Every event field must be specified at the emit site.

**Fix**: add the missing field.

## Macro errors

### "expected struct-literal expression after `require!(cond, ...)`"

```otigen
require!(cond, "this string is ignored");   // bug, no error today
```

The compiler currently lowers a non-struct second argument as
a generic `Error` payload with no fields (silently dropping
the string). A future compiler version will reject the string
form outright; for now, *always use a typed error*:

```otigen
error MyError {}
require!(cond, MyError {});
```

See [Chapter 6.2](ch06-02-require-revert.md).

### "cannot find `X` in this scope"

You referenced a function, type, or constant that the
compiler doesn't know about.

**Fix**: import it via `use`, or check spelling.

## Selector errors

### "function selectors collide between `foo` and `bar`"

The FNV-1a hashes of `foo` and `bar` both produce the same
4-byte selector. Extremely rare.

**Fix**: rename one of the functions.

---

That's the common-error set. The compiler's diagnostics are
designed to suggest the fix in many cases; if the message
doesn't, this appendix is the second line of defence. If you
hit an error not in this list and the message isn't clear,
it's reasonable to file an issue against the compiler — the
goal is for every error to teach.
