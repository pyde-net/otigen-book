# Functions

Functions are prevalent in Otigen code. You've already seen one of
the most common: `pub fn`, used to declare a public entry point in a
contract. You've also seen plain `fn` (without `pub`) for internal
helpers, and `#[constructor]` for one-shot initialisers.

Otigen code uses *snake case* as the conventional style for function
and variable names, in which all letters are lowercase and
underscores separate words. Here's a contract that contains an
example of a function definition:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        another_function();
    }

    fn another_function() {
        // (function body)
    }
}
```

We define a function in Otigen by entering `fn` followed by a
function name and a set of parentheses. The curly brackets tell the
compiler where the function body begins and ends. If you're inside
a `contract` block, the function is a *method* of that contract.

We can call any function we've defined by entering its name followed
by a set of parentheses. Because `another_function` is defined in
the same contract as `run`, we can call it from inside `run`.

Note that Otigen doesn't care where you define your functions, only
that they're defined somewhere in a scope that the caller can see.
Internal functions (without `pub`) can be called from any function
in the same contract; the order doesn't matter.

## Parameters

We can define functions to have *parameters*, which are special
variables that are part of a function's signature. When a function
has parameters, you can provide it with concrete values for those
parameters. Technically, the concrete values are called *arguments*,
but in casual conversation people tend to use the words *parameter*
and *argument* interchangeably.

In this version of `another_function`, we add a parameter:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        another_function(5);
    }

    fn another_function(x: u64) {
        let _ = x; // pretend we use it
    }
}
```

The declaration of `another_function` has one parameter named `x`.
The type of `x` is specified as `u64`. When we pass `5` in to
`another_function`, the compiler binds the literal to `x`.

In function signatures, you *must* declare the type of each
parameter. This is a deliberate decision in Otigen's design:
requiring type annotations in function definitions means the compiler
almost never needs you to use them elsewhere in the code to figure
out what type you mean.

When defining multiple parameters, separate the parameter
declarations with commas, like this:

```otigen
fn print_labelled(label: String, value: u64) {
    // ...
}
```

## Statements and Expressions

Function bodies are made up of a series of *statements* optionally
ending in an *expression*. So far, the functions we've covered
haven't had an ending expression, but you have seen an expression as
part of a statement. Because Otigen is an expression-based language
(like Rust), this is an important distinction to understand. Other
languages don't have the same distinctions, so let's look at what
statements and expressions are and how their differences affect the
bodies of functions.

* **Statements** are instructions that perform some action and do
  not return a value.
* **Expressions** evaluate to a resultant value. Let's look at some
  examples.

We've actually already used statements and expressions. Creating a
variable and assigning a value to it with the `let` keyword is a
statement:

```otigen
let y = 6;
```

Expressions evaluate to a value and make up most of the rest of the
code that you'll write in Otigen. Consider a math operation, such as
`5 + 6`, which is an expression that evaluates to the value `11`.
Expressions can be part of statements: in `let y = 6;`, the `6` is
an expression that evaluates to the value `6`. Calling a function is
an expression. Calling a macro (like `require!`) is an expression.
A new block created with curly brackets is an expression:

```otigen
let y = {
    let x = 3;
    x + 1
};
```

This expression:

```otigen
{
    let x = 3;
    x + 1
}
```

is a block that, in this case, evaluates to `4`. That value gets
bound to `y` as part of the `let` statement. Note that the `x + 1`
line doesn't have a semicolon at the end. **Expressions do not
include ending semicolons.** If you add a semicolon to the end of
an expression, you turn it into a statement, and it will then not
return a value.

## Functions with Return Values

Functions can return values to the code that calls them. We don't
name return values, but we must declare their type after an arrow
(`->`). In Otigen, the return value of the function is *not* the
value of the final expression in the block of the body of a function
— Otigen requires an explicit `return` statement. Here's an example:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    fn five() -> u64 {
        return 5;
    }

    pub fn run() {
        let x = five();
        // x is now 5
    }
}
```

There are no function calls, macros, or even `let` statements in the
`five` function — just the `return` statement of `5`. That's a
perfectly valid function in Otigen. Note that the function's return
type is specified too, as `-> u64`.

If you forget the `return`, the compiler will complain that the
function should return a `u64` but the body falls through:

```sh
error: function `five` is declared to return `u64` but the body has
       no return statement
  --> src/Playground.oti:2:5
   |
 2 |     fn five() -> u64 {
   |     ^^^^^^^^^^^^^^^^ expected `return <u64>;`
   |
```

This is an opinionated choice. Rust lets the last expression be the
implicit return; Otigen does not. Requiring `return` makes the
function's exit point unambiguous when reading code — there is
never a "where did this value come from?" moment.

## Tuples as Return Values

A function can return more than one value by packing them into a
*tuple*. A tuple is a fixed-length sequence of values, where each
position can have a different type:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    fn split(amount: u256) -> (u256, u256) {
        let half = amount / 2;
        return (half, amount - half);
    }

    pub fn run() {
        let (a, b) = split(1000);
        // a is 500, b is 500
    }
}
```

The function `split` returns a tuple of `(u256, u256)`. The caller
*destructures* the tuple in the `let` binding: `let (a, b) = …`
binds `a` to the first element of the tuple and `b` to the second.

Tuples are values: passing a tuple to a function copies it. There's
no tuple sub-indexing syntax (no `pair.0`); always destructure.

## Calling functions across contracts

So far we've called functions within the same contract. To call
functions on *another* contract — say, a token contract from a
multisig — you'll use a typed `Interface` or a low-level `raw_call!`.
We'll cover both in [Chapter 10](ch10-00-cross-contract.md). They
look syntactically very similar to in-contract calls, with the
addition of a target address.

## Summary

Functions are declared with `fn` (internal) or `pub fn` (public).
Parameters always carry their types. Return types follow `->`.
Every function with a return type must end in an explicit `return`.
Tuples let a function hand back several values at once.

Up next, the smallest topic in the chapter: [comments](ch03-04-comments.md).
