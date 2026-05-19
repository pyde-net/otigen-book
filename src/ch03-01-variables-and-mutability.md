# Variables and Mutability

As mentioned in [Chapter 2](ch02-00-counter-project.md), by default
variables in Otigen are *immutable*. This is one of many nudges
Otigen gives you to write code that takes advantage of the safety
and easy concurrency that the language provides. You still have the
option to make your variables mutable. Let's explore how and why
Otigen encourages you to favour immutability, and why sometimes you
might want to opt out.

When a variable is immutable, once a value is bound to a name, you
can't change that value. To illustrate, let's create a small contract
called `playground` with a function that runs each example we want
to try.

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let x = 5;
        // Try to change x:
        x = 6;
    }
}
```

Save and try to build:

```sh
$ pyde-dev build
error: cannot assign to immutable binding `x`
  --> src/Playground.oti:5:9
   |
 3 |         let x = 5;
   |             - first defined here
 4 |         // Try to change x:
 5 |         x = 6;
   |         ^^^^^ cannot assign to immutable variable
   |
   = help: consider making this binding mutable with `let mut x = 5;`
```

This example shows how the compiler helps you find errors in your
programs. Compiler errors can be frustrating, but really they only
mean your program isn't safely doing what you want it to do yet;
they do *not* mean that you're not a good programmer! Experienced
Otigen developers still see compiler errors all day.

The error message indicates that the cause of the issue is that
you're trying to assign a second value to the immutable variable `x`.

It's important that we get compile-time errors when we attempt to
change a value that's designated immutable: this very situation can
lead to bugs that are hard to track down after the fact, especially
when the value in question is shared between many parts of the code.

But mutability can be very useful and can make code more convenient
to write. Although variables are immutable by default, you can make
them mutable by adding `mut` in front of the variable name as you
did in [Chapter 2](ch02-00-counter-project.md). Adding `mut` also
conveys intent to future readers of the code by indicating that other
parts of the code will be changing this variable's value.

For example, let's change `src/Playground.oti` to the following:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let mut x = 5;
        x = 6;
    }
}
```

When you build the program now, it compiles cleanly:

```sh
$ pyde-dev build
   Compiling Playground.oti
   Wrote out/Playground.pyc
```

We're allowed to change the value bound to `x` from `5` to `6` when
`mut` is used. Ultimately, deciding whether to use mutability or not
is up to you and depends on what you think is clearest in that
particular situation.

## Constants

Like immutable variables, *constants* are values that are bound to a
name and are not allowed to change, but there are a few differences
between constants and variables.

First, you aren't allowed to use `mut` with constants. Constants
aren't just immutable by default — they're always immutable. You
declare constants using the `const` keyword instead of the `let`
keyword, and the type of the value *must* be annotated. We'll cover
types in detail in the next section ([Data Types](ch03-02-data-types.md));
for now, know that you must always annotate the type of a constant.

Constants can be declared in any scope, including the top level of a
file. That makes them useful for shared values that many parts of a
contract need to know about.

The last difference is that constants may be set only to a constant
expression, not the result of a value that could only be computed at
runtime.

Here's an example of a constant declaration:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
const FEE_BPS: u32 = 30;

contract Playground {
    pub fn run() {
        // We can use FEE_BPS anywhere:
        let basis_points = FEE_BPS;
    }
}
```

The constant's name is `FEE_BPS`, and its value is set to `30`.
Otigen's naming convention for constants is to use all uppercase with
underscores between words (sometimes called `SCREAMING_SNAKE_CASE`).
Constants are valid for the entire time the contract is deployed:
they're compiled into the bytecode and never read from storage.

Naming hard-coded values used throughout your program as constants
is useful in conveying the meaning of that value to future
maintainers of the code. It also helps to have only one place in
your code you'd need to change if the value needed to be updated in
the future.

## A note for Rust developers: no shadowing

If you're coming to Otigen from Rust, you might expect to be able to
declare a new variable with the same name as a previous variable —
the feature Rust calls *shadowing*. In Otigen, you can't.

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let x = 5;
        let x = x + 1; // <-- error in Otigen
    }
}
```

```sh
$ pyde-dev build
error: 'x' is already defined in this scope (first defined at src/Playground.oti:3:13)
  --> src/Playground.oti:4:13
   |
 4 |         let x = x + 1;
   |             ^ name already in use
```

If you want a new binding, give it a different name. If you want to
change a value while keeping the name, use `let mut`. Both choices
are explicit, which is the design intent — you cannot accidentally
re-bind a name in a long function and silently lose access to the
earlier value.

## Summary

Variables in Otigen are immutable by default. Opt in to mutation
with `let mut`. Use `const` for compile-time constants that ride
along with the bytecode. You cannot shadow an existing binding;
re-binding a name in the same scope is an error.

In the [next section](ch03-02-data-types.md) we'll look at the
types those variables can hold.
