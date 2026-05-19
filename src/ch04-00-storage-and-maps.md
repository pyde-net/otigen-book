# Storage and Maps

Every smart contract has *state*. State that needs to outlive a
single function call is *persistent state*, and persistent state in
Otigen lives in the `storage { … }` block.

In this chapter we'll cover four things:

- How the `storage` block is declared and what types can go in it.
- How `Map<K, V>`, Otigen's built-in associative type, works.
- How the compiler assigns slot numbers to your fields — and why you
  almost never need to think about them.
- The *lazy allocation* model: why an unread map entry costs
  nothing, and what the zero value of each type is.

We've already used storage in [Chapter 2](ch02-00-counter-project.md);
this chapter is the systematic explanation.
