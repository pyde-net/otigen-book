# `Interface::at(address)`

`IName::at(addr)` is the constructor that turns an interface
declaration and an address into a *typed handle*. Calling a method
on the handle compiles to a cross-contract call to the address
with the correct selector and ABI-encoded arguments.

```otigen
let token = IToken::at(self.token_addr);
let bal = token.balance_of(msg.sender);
token.transfer(recipient, 1_000);
```

This is the normal, day-to-day way Otigen contracts call each
other. It's type-checked, name-checked, ABI-encoded automatically,
and reads at the call site like any other method call.

## The shape of a call

The handle returned by `IName::at(addr)` lasts as long as the
local binding does. Inside that scope, the method calls dispatch
through it:

```otigen
contract Vault {
    storage {
        token_addr: Address,
    }

    pub fn deposit(amount: u256) {
        let token = IToken::at(self.token_addr);
        // Pull the user's tokens into the vault:
        token.transfer_from(msg.sender, address(self), amount);
        // Update accounting:
        self.balances[msg.sender] = self.balances[msg.sender] + amount;
    }
}
```

You can also call methods inline without binding:

```otigen
IToken::at(self.token_addr).transfer(recipient, amount);
```

Both forms compile identically. The binding form reads better when
you call the same target multiple times in one function.

## What the call actually does

When you write `IToken::at(addr).transfer(to, amount)`, the
compiler emits a cross-contract call instruction. The runtime:

1. Computes the selector for `transfer` (FNV-1a hash of
   `"transfer"`, truncated to four bytes).
2. ABI-encodes the arguments `(to, amount)` after the selector.
3. Sends the calldata to `addr` with whatever gas was provided
   (the default is the rest of the current function's gas budget,
   minus a small reserve).
4. Waits for the call to return.
5. If the call succeeded, decodes the return value (if any) into
   an Otigen value of the interface's declared return type.
6. If the call reverted, re-raises the revert in the calling
   function — the *caller* reverts too, propagating the failure
   up.

You'll notice item 6 is implicit: typed `Interface::at` calls
*propagate* reverts. If you want to handle the revert without
giving up, use [`raw_call!`](ch10-03-raw-call.md) instead.

## Calling a payable method

If the method on the target is `#[payable]`, you call it with
value using the brace-attached-to-the-method-name syntax:

```otigen
interface IWrapper {
    fn deposit();
}

contract Wrapper {
    storage { wrapper_addr: Address }

    #[payable]
    pub fn wrap_native() {
        IWrapper::at(self.wrapper_addr).deposit{ value: msg.value }();
    }
}
```

The shape is `method{ value: amount }(args...)`. The `value:`
field goes inside the braces; the function arguments go inside
the parentheses. Empty argument lists still need the `()`.

If the target method *isn't* payable and you attach a value, the
target's runtime checks reject the call before its body runs, and
the cross-call reverts. There's no way for the caller to know in
advance whether the target accepts value (the interface
declaration doesn't carry that information); you trust the
interface or you read the deployed contract's ABI.

## Specifying gas

By default, the compiler forwards "the remaining gas budget"
to the cross-call. If you want to limit gas explicitly — for
example, to ensure a misbehaving callee can't consume your
contract's entire budget — pass `gas:` in the brace block:

```otigen
IUntrusted::at(addr).maybe_misbehave{ gas: 100_000 }();
```

The braces accept both `value:` and `gas:`:

```otigen
IThing::at(addr).pay_and_call{ value: 1_000, gas: 50_000 }(args);
```

Gas-limit on cross-calls is a defensive tool. If you're calling a
known-trusted contract, you don't need it. If you're calling a
contract whose author you don't trust to be polite about gas
consumption, set a limit so a runaway callee can't exhaust your
gas before you can act.

## Handling the return value

A cross-call's return value, if any, is a normal Otigen value:

```otigen
interface IOracle {
    fn current_price(asset: Address) -> u256;
}

let price: u256 = IOracle::at(self.oracle).current_price(self.base_asset);
require!(price > 0, OracleUnavailable {});
```

If the return type is a tuple, destructure it:

```otigen
interface IAmmPool {
    fn get_reserves() -> (u256, u256);
}

let (reserve_in, reserve_out) = IAmmPool::at(self.pool).get_reserves();
```

If the return type is a struct, you read its fields normally:

```otigen
struct Order { holder: Address, size: u256 }
interface IBook {
    fn get_order(id: u64) -> Order;
}

let o = IBook::at(self.book).get_order(id);
let holder: Address = o.holder;
```

The compiler decodes the bytes returned by the callee into the
declared return type, the same way it decoded the calldata going
out.

## What if the address isn't actually that interface?

`Interface::at(addr)` is a *bet*. The address might not host the
expected interface — it might be a different contract, or no
contract at all. The compiler can't verify; only the runtime can,
when the call goes out.

The failure modes:

- **No contract at the address.** The runtime returns "called
  account has no code". The cross-call reverts; your contract
  reverts too.
- **Contract exists but doesn't implement the method.** The
  selector doesn't match anything; the callee's `#[fallback]`
  runs (if it has one) or it reverts. Your call sees a revert.
- **Contract implements a *different* function with the same
  selector.** The collision space is small but non-zero. Your call
  runs the wrong function; the result is undefined.

The defensive pattern: deploy the targets you intend to call, or
allow-list addresses, or pass them in a constructor where the
deployer is responsible for getting them right. The interface
declaration is a *type* on top of an untrusted address; trust
follows from the deployment process, not from the call.

## Calling a contract you wrote yourself

The most common case is calling a contract from the same project.
The compiler can verify even more in this case: if the target
contract is in your `src/`, the build looks up the implementation
and confirms that the interface declaration matches the actual
function. Mismatches are a compile error rather than a runtime
revert.

```otigen
use my_project::Token;

// ...

let bal = IToken::at(self.token_addr).balance_of(msg.sender);
```

If `Token`'s `balance_of` takes different arguments than the
`IToken` interface declares, the build fails. This is the
recommended pattern for in-project calls — you get the static
guarantee that the call shapes line up.

## Summary

`IName::at(address)` turns an interface declaration and an
address into a typed handle. Calls through the handle are
selector-correct, ABI-encoded, and return-type-decoded
automatically. Use the `method{ value: amount }(args)` form to
attach value, and `method{ gas: limit }(args)` to bound the
gas. Reverts from the callee propagate to the caller; for
catch-and-handle behaviour, use `raw_call!`.

The [next section](ch10-03-raw-call.md) covers the low-level
form that gives you the catch-the-revert ability.
