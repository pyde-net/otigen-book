# Hello, Otigen!

Now that you've installed Otigen, it's time to write your first program.
It's traditional when learning a new language to write a small "Hello,
world!" program that prints `Hello, world!` to the screen, so we'll do
the equivalent in Otigen.

There's a wrinkle: Otigen programs are *smart contracts*. They don't
print to a terminal — they run on a blockchain. The closest thing to
`println!` we have is *emitting an event*: a structured log line that
appears in the transaction's receipt and that any off-chain tool can
read.

Let's write the smallest possible contract that emits a hello event.

## Creating a project file

Make a directory anywhere convenient and create a file inside it:

```sh
$ mkdir hello_otigen
$ cd hello_otigen
$ touch Hello.oti
```

Open `Hello.oti` and type the following:

<span class="filename">Filename: Hello.oti</span>

```otigen
contract Hello {
    event Greeting {
        message: String,
    }

    pub fn greet() {
        emit Greeting { message: "Hello, Otigen!" };
    }
}
```

Save the file and let's walk through what each line means.

## Anatomy of a `Hello` contract

```otigen
contract Hello {
```

Every Otigen program lives inside a `contract` block. The name (`Hello`
here) is how the contract will be referred to in the ABI and from any
deployment script. You can have more than one `contract` per file, but
for now we have just the one.

```otigen
    event Greeting {
        message: String,
    }
```

This declares an *event*. An event is a typed payload the contract may
emit; downstream listeners (block explorers, indexers, our own scripts)
read events from the transaction receipt to learn what happened. Our
`Greeting` event has a single field, `message`, of type `String`.

```otigen
    pub fn greet() {
        emit Greeting { message: "Hello, Otigen!" };
    }
```

`pub fn greet()` declares a public function called `greet` that takes
no arguments and returns nothing. The `pub` keyword makes it callable
from outside the contract — without it, the function would be internal
and reachable only from other functions in the same contract.

The body of the function has a single statement: `emit Greeting {
message: "Hello, Otigen!" };`. The `emit` keyword takes a value of an
event type and writes it to the receipt. Inside the braces we set
each field of the event by name.

A few details to notice:

* Function bodies in Otigen always use `{ ... }`, even for one-line
  functions.
* Statements end with a semicolon (`;`).
* String literals use double quotes (`"..."`) and accept UTF-8.

## Compiling with `otic`

To turn our `.oti` source into something executable, we run the
compiler directly:

```sh
$ otic build Hello.oti
   Compiling Hello.oti
   Wrote out/Hello.pyc
```

The compiler reads `Hello.oti`, type-checks it, runs its safety
analyses, and emits a `.pyc` file — a JSON artifact that bundles the
PVM bytecode, the ABI, and metadata. Open `out/Hello.pyc` if you're
curious; the bytecode is opaque, but the `abi` section is human-readable
and lists every public function, event, and error your contract
declared.

## What `otic` is doing

When `otic` accepts your source, it has actually done quite a lot:

1. **Lexing** — turned the text into tokens (`contract`, `Hello`, `{`, …).
2. **Parsing** — built an abstract syntax tree from the tokens.
3. **Resolution** — looked up every name (`String`, `emit`, `Greeting`)
   and confirmed it refers to something real.
4. **Type-checking** — verified that the literal `"Hello, Otigen!"` has
   type `String` and matches the field declared in `Greeting`.
5. **Safety analysis** — would have rejected `greet` if it tried to,
   for example, write storage while marked `#[view]` (we'll meet `#[view]`
   in [Chapter 8](ch08-01-view.md)).
6. **Lowering** — translated the AST into PVM intermediate code.
7. **Optimization** — folded constants, inlined small calls, eliminated
   dead code.
8. **Code generation** — emitted the PVM bytecode and the ABI.

We'll come back to the pipeline in detail in
[Chapter 13](ch13-00-pvm.md). For now, the important point is that
`otic build` either succeeds or gives you a precise error pointing at
the line that's wrong.

## Seeing an error

To get a feel for the error reporter, change the type of the event
field to something nonsensical, like `Stringy`:

<span class="filename">Filename: Hello.oti</span>

```otigen
contract Hello {
    event Greeting {
        message: Stringy,
    }
    // ...
}
```

Recompile:

```sh
$ otic build Hello.oti
error: unknown type 'Stringy'
  --> Hello.oti:3:18
   |
 3 |         message: Stringy,
   |                  ^^^^^^^ help: did you mean `String`?
   |

Compilation failed (1 error).
```

The error tells you *where* the problem is (file, line, column), *what*
it is (an unknown type), and offers a suggestion. The Otigen compiler
takes diagnostic quality seriously; the goal is that you fix the error
without leaving your editor. Fix the typo back to `String` and the
build succeeds again.

You've now written and compiled an Otigen program. Real projects, of
course, are bigger than one file. In the next section we'll use
`pyde-dev` to scaffold a multi-file project with tests and deployment
scripts.
