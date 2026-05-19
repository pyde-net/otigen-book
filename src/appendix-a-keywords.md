# Appendix A — Keywords

Otigen reserves 30 keywords. They cannot be used as
identifiers. The list, alphabetical:

| Keyword     | Purpose                                                  |
|-------------|----------------------------------------------------------|
| `as`        | Type cast (`x as u64`)                                   |
| `break`     | Exit a loop                                              |
| `const`     | Compile-time constant declaration                        |
| `continue`  | Skip to next loop iteration                              |
| `contract`  | Top-level deployable unit                                |
| `else`      | Alternative branch of `if`                               |
| `emit`      | Write an event to the receipt                            |
| `enum`      | Tagged sum type                                          |
| `error`     | Typed error declaration                                  |
| `event`     | Typed event declaration                                  |
| `false`     | Boolean literal                                          |
| `fn`        | Function declaration                                     |
| `for`       | Loop over a range or collection                          |
| `if`        | Conditional branch                                       |
| `in`        | Used in `for x in expr`                                  |
| `interface` | External-contract method-signature declaration           |
| `let`       | Local-variable binding                                   |
| `match`     | Pattern-matched branch                                   |
| `module`    | Module-namespace declaration                             |
| `mut`       | Marks a binding as reassignable                          |
| `pub`       | Marks a function as ABI-callable                         |
| `return`    | Exit a function with an optional value                   |
| `self`      | Reference to the current contract instance               |
| `storage`   | The persistent-state block                               |
| `struct`    | Product (record) type                                    |
| `true`      | Boolean literal                                          |
| `try`       | Error-trapping expression (parsed; runtime semantics pending) |
| `type`      | Type alias                                               |
| `use`       | Import statement                                         |
| `while`     | Condition-driven loop                                    |

A few notes:

- **`try`** is parsed by the compiler but its runtime
  semantics are not yet wired in (see
  [Chapter 6](ch06-00-errors.md)). Treat it as reserved but
  unavailable.
- **`Address`, `Map`, `Vec`, `String`, `bytes`, and the
  integer types (`u8`–`u256`, `i8`–`i256`, `bool`)** are
  *built-in types*, not keywords. You can't shadow them with
  a local of the same name (the compiler rejects), but they're
  not in the keyword table because the parser treats them as
  identifiers that bind to the built-in type definitions.
- **`Address::ZERO`, `msg`, `block`, `tx`**, and the built-in
  function names (`hash`, `gas_remaining`, `require!`,
  `assert!`, `revert!`, `emit`, `deploy!`, `raw_call!`,
  `cross_call!`) are also reserved at the resolution stage:
  the compiler won't let you declare a local or function with
  these names. See [Appendix C](appendix-c-builtins.md) for
  details on each.
