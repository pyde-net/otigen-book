# Control Flow

The ability to run some code depending on whether a condition is
`true` and to run some code repeatedly while a condition is `true`
are basic building blocks in most programming languages. The most
common constructs that let you control the flow of execution of
Otigen code are `if` expressions and loops.

## `if` Expressions

An `if` expression allows you to branch your code depending on
conditions. You provide a condition and then state, "If this
condition is met, run this block of code. If the condition is not
met, do not run this block of code."

Here's a small example:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let number = 3;

        if number < 5 {
            // condition was true
        } else {
            // condition was false
        }
    }
}
```

All `if` expressions start with the keyword `if`, followed by a
condition. In this case, the condition checks whether or not the
variable `number` has a value less than `5`. We place the block of
code to execute if the condition is `true` immediately after the
condition inside curly brackets. Optionally, we can also include an
`else` expression, which we chose to do here, to give the program an
alternative block of code to execute should the condition evaluate
to `false`. If you don't provide an `else` expression and the
condition is `false`, the program will just skip the `if` block and
move on to the next bit of code.

It's also worth noting that the condition in this code *must* be a
`bool`. If the condition isn't a `bool`, we'll get an error:

```otigen
let number = 3;

if number {
    // ...
}
```

```sh
error: condition of `if` must be `bool`, found `u256`
  --> src/Playground.oti:4:12
   |
 4 |     if number {
   |        ^^^^^^ expected `bool`
```

Unlike languages such as JavaScript and Python, Otigen will not
automatically try to convert non-Boolean types to a Boolean. You
must be explicit and always provide `if` with a Boolean as its
condition. If we want the `if` code block to run only when a number
is not equal to `0`, for example, we can change the `if` expression
to the following:

```otigen
if number != 0 {
    // number was something other than zero
}
```

### Handling Multiple Conditions with `else if`

You can use multiple conditions by combining `if` and `else` in an
`else if` expression. For example:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let number = 6;

        if number % 4 == 0 {
            // divisible by 4
        } else if number % 3 == 0 {
            // divisible by 3
        } else if number % 2 == 0 {
            // divisible by 2
        } else {
            // not divisible by 2, 3, or 4
        }
    }
}
```

This program has four possible paths it can take. Otigen only
executes the block for the first true condition, and once it finds
one, it doesn't even check the rest.

Using too many `else if` expressions can clutter your code, so if
you have more than one, you might want to refactor your code. Otigen
has a powerful branching construct called `match` that we'll meet in
[Chapter 5](ch05-03-match.md) — it's the natural fit when you're
branching on the variants of an `enum` value.

### Using `if` in a `let` Statement

Because `if` is an expression, we can use it on the right side of a
`let` statement to assign the outcome to a variable, as in Listing
3-2.

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let condition = true;
        let number = if condition { 5 } else { 6 };
    }
}
```

<span class="caption">Listing 3-2: assigning the result of an `if`
expression to a variable</span>

The `number` variable will be bound to a value based on the outcome
of the `if` expression. Recall from [the previous
section](ch03-03-functions.md) that blocks of code evaluate to the
last expression in them, and numbers by themselves are also
expressions. In this case, the value of the whole `if` expression
depends on which block of code executes. This means the values that
have the potential to be results from each arm of the `if` must be
the same type; in Listing 3-2, the results of both the `if` arm and
the `else` arm were `u256` integers. If the types are mismatched,
as in the following example, we'll get an error:

```otigen
let number = if condition { 5 } else { "six" }; // <-- error
```

```sh
error: `if` and `else` arms have incompatible types
   = note: expected `u256`, found `String`
```

The expression in the `if` block evaluates to an integer, and the
expression in the `else` block evaluates to a string. This won't
work because variables must have a single type, and Otigen needs to
know at compile time what type the `number` variable is, definitively.

## Repetition with Loops

It's often useful to execute a block of code more than once. For
this task, Otigen provides two kinds of *loops*: `while` for
condition-driven loops, and `for` for iterating a known range or
collection.

Otigen does not have an unconditional `loop` keyword (Rust does;
Otigen omits it because gas-bounded execution makes infinite loops
a poor fit for contracts).

### Conditional Loops with `while`

A program will often need to evaluate a condition within a loop.
While the condition is `true`, the loop runs. When the condition
ceases to be `true`, the program calls `break`, stopping the loop —
or the loop's condition itself becomes false. We can implement a
behaviour like this using a combination of `while`, `if`, `else`,
and `break`. Try it now in `src/Playground.oti`:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let mut number = 3u64;

        while number != 0 {
            // each tick, number gets smaller
            number = number - 1;
        }

        // number is now 0
    }
}
```

This construct eliminates a lot of nesting that would be necessary
if you used `if`, `else`, and `break` directly, and it's clearer.
While a condition holds true, the code runs; otherwise, it exits
the loop.

### Looping Through a Collection with `for`

You can choose to use the `while` construct to loop over the
elements of a collection, such as a vector. For example, the loop
below prints each element in the vector `a`. Wait — Otigen contracts
don't print. Replace "prints" with "applies":

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run(actions: Vec<u64>) {
        let mut index = 0u64;
        while index < actions.len() {
            let item = actions[index];
            self.apply(item);
            index = index + 1;
        }
    }

    fn apply(_item: u64) { /* ... */ }
}
```

However, this approach is error-prone; we could cause the contract
to revert if the index value or test condition is incorrect. For
example, if you changed the definition of the `actions` vector to
have four elements but forgot to update the condition to
`index < 4`, the contract would still work, but the runtime would
do extra checking on every iteration of the loop. It's also slow,
because the compiler adds runtime code to perform the conditional
check of whether the index is within the bounds of the vector on
every iteration through the loop.

As a more concise alternative, you can use a `for` loop and execute
some code for each item in a collection:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run(actions: Vec<u64>) {
        for item in actions {
            self.apply(item);
        }
    }

    fn apply(_item: u64) { /* ... */ }
}
```

Using the `for` loop, we wouldn't need to remember to change any
other code if we changed the number of values in the vector. The
safety and conciseness of `for` loops make them the most commonly
used loop construct in Otigen.

`for` also accepts a *range* in place of a collection. Ranges are
written `start..end` and produce the values `start, start+1, …,
end−1`:

```otigen
for i in 0..10 {
    // i takes the values 0, 1, 2, ..., 9
}
```

Both bounds must be integer expressions of the same type. The
upper bound is exclusive.

### `break` and `continue`

Inside any loop, the keyword `break` exits the loop immediately, and
`continue` skips to the next iteration:

```otigen
for i in 0..100 {
    if self.skip(i) { continue; }
    if self.done(i) { break; }
    self.process(i);
}
```

### A note on iterating Maps

You **cannot** write `for entry in self.some_map { … }` — a
`Map<K, V>` in Otigen does not know what keys it contains. The
storage layout is sparse; only entries you've written exist on-
chain. If you need to iterate keyed state, keep a parallel `Vec<K>`
of the keys you've inserted. We'll see the pattern in
[Chapter 4](ch04-02-maps.md).

## Summary

`if` lets you branch; it's also an expression you can use on the
right of a `let`. `while` loops as long as a condition holds. `for`
iterates a range or a vector. `break` exits a loop; `continue`
skips an iteration. Maps are not iterable.

That's the end of [Common Programming Concepts](ch03-00-common-concepts.md).
With variables, types, functions, comments, and control flow under
your belt, you have everything you need to write a wide range of
contracts. In the next chapter we'll look at one part of Otigen
that's distinctly its own: the typed `storage` block and the
`Map<K, V>` type that lives inside it.
