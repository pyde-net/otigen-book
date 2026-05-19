# Function Attributes

An *attribute* is a piece of compile-time metadata you attach to a
function. It looks like `#[name]` or `#[name(args)]` and sits on
the line above the function declaration:

```otigen
#[view]
pub fn balance_of(owner: Address) -> u256 {
    return self.balances[owner];
}
```

Attributes don't change the *body* of the function — they change
the *contract* the function makes with the rest of the language.
`#[view]` adds the contract "this function does not mutate state".
`#[payable]` adds the contract "this function may receive native
value". `#[constructor]` adds the contract "this function runs
once, at deployment time".

Otigen recognises seven function attributes. This chapter takes
them one at a time, in roughly increasing order of how often
you'll reach for them:

| Attribute        | What it declares                                  |
|------------------|---------------------------------------------------|
| `#[view]`        | the function does not mutate state                |
| `#[payable]`     | the function may receive native value             |
| `#[constructor]` | the function runs once at deployment              |
| `#[reentrant]`   | the function opts out of the default reentrancy guard |
| `#[receive]`     | the function handles bare native-value transfers  |
| `#[fallback]`    | the function handles calls with unrecognised selectors |
| `#[test]`        | the function is a unit test                       |

(`#[indexed]` is an attribute too, but it's for event *fields*, not
functions — we covered it in [Chapter 7](ch07-02-indexed.md).)

A function can carry multiple attributes:

```otigen
#[receive]
#[payable]
pub fn on_value() {
    // handle the bare value transfer
}
```

Some combinations are illegal — for example, a function cannot be
both `#[view]` and `#[payable]`, because a function that receives
value is necessarily a mutating function. The chapter calls out
the conflicts as we meet them.

`#[sponsored]` exists as an eighth attribute that arranges for the
gas to be paid by a paymaster rather than the caller. It belongs
with the chain-runtime material (it depends on the gas-tank
mechanism), and we'll cover it in
[Chapter 15](ch15-00-access-lists.md) alongside the runtime
features it interacts with.
