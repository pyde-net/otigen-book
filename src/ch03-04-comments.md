# Comments

All programmers strive to make their code easy to understand, but
sometimes extra explanation is warranted. In these cases, programmers
leave *comments* in their source code that the compiler will ignore
but people reading the source code may find useful.

Here's a simple comment:

```otigen
// hello, world
```

In Otigen, the idiomatic comment style starts a comment with two
slashes, and the comment continues until the end of the line. For
comments that extend beyond a single line, you'll need to include
`//` on each line, like this:

```otigen
// So we're doing something complicated here, long enough that we need
// multiple lines of comments to do it! Whew! Hopefully, this comment will
// explain what's going on.
```

Comments can also be placed at the end of lines containing code:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        let lucky_number = 7; // I'm feeling lucky today
    }
}
```

But you'll more often see them used in this format, with the comment
on a separate line above the code it's annotating:

<span class="filename">Filename: src/Playground.oti</span>

```otigen
contract Playground {
    pub fn run() {
        // I'm feeling lucky today
        let lucky_number = 7;
    }
}
```

## Block Comments

If you need to comment out a region too large for line comments,
Otigen supports block comments delimited by `/*` and `*/`:

```otigen
/*
 * This whole block is a comment.
 * Use it sparingly; reviewers can miss it.
 */
```

Block comments may also be nested, which is useful when you want to
comment out a section that already contains a block comment:

```otigen
/* outer
   /* nested */
   still outer */
```

The nesting behaviour is one place where Otigen differs from C and
Solidity — both languages refuse to nest `/* */`. Otigen allows it
so you can comment-out a region without worrying about whether an
existing comment closes early.

## Documentation Comments

Otigen has a third comment style: *documentation comments*, written
with `///`. The compiler reads them and emits the text alongside the
ABI in metadata. Use them for public functions, events, and errors
that downstream consumers will want documentation for.

<span class="filename">Filename: src/Token.oti</span>

```otigen
contract Token {
    /// Return the balance of `owner` in the smallest unit
    /// of this token. Returns `0` for accounts that have
    /// never held a balance.
    #[view]
    pub fn balance_of(owner: Address) -> u256 {
        return self.balances[owner];
    }
}
```

The metadata produced by `wright build` includes the doc text
verbatim. Tools like `wright doc` render it into HTML or Markdown
reference pages.

A guideline:

* `//` for notes to *you and your collaborators*.
* `///` for notes to *anyone calling your contract from the outside*.

Both ignore further analysis from the compiler — neither comment
form participates in lexing of identifiers or expressions. Comments
exist so humans can talk to humans through the code.

## Summary

Otigen has three comment forms: `//` line, `/* */` block (nestable),
and `///` doc. Use line comments for almost everything. Reach for
block comments only when you need to mute a chunk of code during
debugging. Use doc comments on public-facing surface so your ABI
ships with useful prose.

The [next section](ch03-05-control-flow.md) is the last one in this
chapter: control flow.
