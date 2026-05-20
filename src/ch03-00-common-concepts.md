# Common Programming Concepts

This chapter covers concepts that appear in almost every Otigen
program. You'll learn about variables, basic types, functions,
comments, and control flow. These foundations will be in every Otigen
contract you write, and learning them early will give you a strong
core from which to start.

> #### Keywords
>
> Some words are *reserved* — they have a meaning in the Otigen
> language and cannot be used as identifiers. The full list is in
> [Appendix A](appendix-a-keywords.md). We'll meet the most important
> ones throughout the rest of this chapter.

Code in this chapter usually appears inside a `contract Demo { … }`
block. Otigen doesn't have a way to run "loose" expressions outside
of a contract — everything compiles to PVM bytecode that the runtime
loads as a contract. If you'd like to try the snippets, drop them
into a `pub fn` body in `src/Demo.oti` and `wright build` from a
project root.
