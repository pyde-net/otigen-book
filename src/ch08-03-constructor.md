# `#[constructor]`

A `#[constructor]` function runs *once*, at the moment the
contract is deployed. It is the only place where deploy-time
inputs (an admin address, an initial supply, a token name) flow
into the contract's persistent state. After deployment, the
constructor is unreachable — it has no selector and no entry in
the dispatch table.

## Declaring a constructor

```otigen
contract Token {
    storage {
        name: String,
        decimals: u8,
        total_supply: u256,
        balances: Map<Address, u256>,
        owner: Address,
    }

    #[constructor]
    pub fn init(name: String, decimals: u8, initial_supply: u256) {
        self.name = name;
        self.decimals = decimals;
        self.total_supply = initial_supply;
        self.balances[msg.sender] = initial_supply;
        self.owner = msg.sender;
        emit Transfer {
            from: Address::ZERO,
            to: msg.sender,
            amount: initial_supply,
        };
    }
}
```

Five rules the example illustrates:

- The function name is conventionally `init`, but the language
  does not require it. The compiler dispatches by the attribute,
  not by the name. Some contracts use the contract's own name
  (`Token`), but `init` reads cleanly.
- The constructor takes the deploy-time arguments as parameters.
  Whoever deploys the contract passes them when they call
  `deploy!`.
- `msg.sender` inside the constructor is *the address that
  deployed the contract*. This is the canonical way to record
  who the contract's initial admin is.
- The constructor can write storage, emit events, call internal
  helpers — anything a normal function can do, with the
  restrictions called out below.
- The function must be `pub`. Otigen does not let you write a
  private constructor: deployment is necessarily an external
  action.

## Calling a constructor

Constructors are not called *as functions* after the contract is
deployed; they are called *by the deployer*. Three places that
happens:

**From a deployment script**, via `deploy!`:

```otigen
contract Deploy {
    pub fn run() {
        let token = deploy!(Token, "Pyde", 9, 1_000_000_000);
    }
}
```

**From inside another contract**, also via `deploy!`. The
returned `Contract<T>` handle is typed; the called contract has
already been initialised by the time `deploy!` returns:

```otigen
let new_market = deploy!(Market, base_token, quote_token);
```

**From a test**, also via `deploy!`. The starter template you saw
in [Chapter 1](ch01-03-hello-pyde-dev.md) uses this form:

```otigen
#[test]
fn it_starts_with_balance() {
    let token = deploy!(Token, "Pyde", 9, 1_000_000_000);
    assert!(token.balance_of(address(self)) == 1_000_000_000);
}
```

After the constructor has run, the `Contract<T>` handle behaves
like any other contract reference — you call its public methods
with normal call syntax.

## Attaching value at deploy time

If you want the contract to receive native PYDE at deployment,
pass `value: amount` to `deploy!`:

```otigen
let vault = deploy!(Vault, owner_addr, value: 1_000_000);
```

Inside the constructor, `msg.value` reads back the attached
amount — the constructor is *implicitly* payable, so you don't
need to mark it `#[payable]`. (If you tried to, the compiler
would reject the combination: `#[constructor] #[payable]` is
forbidden because the redundant marker would be confusing.)

```otigen
#[constructor]
pub fn init(owner: Address) {
    self.owner = owner;
    self.initial_balance = msg.value;  // reads attached value
}
```

If you never want the constructor to receive value, simply don't
read `msg.value` — the deploy script can attach a value and it
will be credited to the contract's balance, but the constructor
won't notice. Most contracts handle this with a `require!`:

```otigen
#[constructor]
pub fn init() {
    require!(msg.value == 0, ConstructorReceivedValue {});
    // ...
}
```

## What a constructor cannot do

A few restrictions.

**`#[constructor]` cannot return a value.** It writes to storage;
the *return value* of a deployment is the contract's address, not
something the constructor produces.

```otigen
#[constructor]
pub fn init() -> u256 { return 0; }  // <-- compile error
```

**`#[constructor]` cannot be `#[view]`.** A constructor that
doesn't write storage is, with rare exception, a bug — you've
deployed a contract whose state will read back as all zeros for
every field. The compiler doesn't reject *that* (an empty
constructor is legal); it does reject the combination with
`#[view]`, which would prevent any writes:

```otigen
#[constructor]
#[view]
pub fn init() { ... }  // <-- compile error
```

**`#[constructor]` cannot be `#[reentrant]`.** Reentrancy
concerns are about post-deployment calls; the constructor runs
once, with the deployer's full control over the call path.
Allowing `#[reentrant]` here would be meaningless.

**`#[constructor]` cannot be `#[test]`.** A test deploys the
contract and exercises it; the constructor itself can't be a
test. If you want to test the constructor's behaviour, write a
`#[test]` function that calls `deploy!` and then asserts about
the resulting state.

## A contract without a constructor

Constructors are optional. If a contract omits the
`#[constructor]` attribute on any of its functions, deployment
simply allocates the contract's address and leaves every storage
field at its zero value:

```otigen
contract Counter {
    storage {
        count: u64,
    }

    pub fn increment() {
        self.count = self.count + 1;
    }
}
```

This is fine when:

- Every field's zero value is the right initial state.
- There are no deploy-time parameters to record.
- No event needs to be emitted at deployment.

Otherwise, write a constructor.

## ABI representation

The ABI lists the constructor (if any) with its argument names
and types, marked as `kind: "constructor"`. Tooling that deploys
the contract reads the constructor entry to know what arguments
to ask for.

The constructor's selector is the reserved value `0x00000000`.
This is what the runtime uses to dispatch the deployment call;
it's why no other function can have a `0x00000000` selector, and
why the selector-hashing function reserves that slot.

## Summary

`#[constructor]` marks the function that runs once at deployment.
Use it for any deploy-time inputs that need to land in storage
or any one-shot events the contract should emit on creation.
Constructors are implicitly payable when the deploy script
attaches value, must be `pub`, must not return a value, and may
not combine with `#[view]`, `#[reentrant]`, or `#[test]`.

The [next section](ch08-04-reentrant.md) covers `#[reentrant]` —
the attribute that opts a function out of Otigen's automatic
reentrancy guard.
