# Appendix B — Operator precedence

The Otigen operator precedence table, from highest binding
(applied first) to lowest binding (applied last). Operators on
the same row have equal precedence and are evaluated
left-to-right.

| Precedence | Operators                                          | Associativity | Notes                                          |
|------------|----------------------------------------------------|---------------|------------------------------------------------|
| 1 (highest) | `.` `[]` `()`                                     | left          | Field access, indexing, call                   |
| 2          | `-` `!` `~` `try`                                  | right         | Unary negation, logical not, bitwise not, try  |
| 3          | `as`                                               | left          | Type cast                                      |
| 4          | `*` `/` `%`                                        | left          | Multiplication, division, modulus              |
| 5          | `+` `-`                                            | left          | Addition, subtraction                          |
| 6          | `<<` `>>`                                          | left          | Bit shifts                                     |
| 7          | `&`                                                | left          | Bitwise AND                                    |
| 8          | `^`                                                | left          | Bitwise XOR                                    |
| 9          | `|`                                                | left          | Bitwise OR                                     |
| 10         | `==` `!=` `<` `>` `<=` `>=`                        | non-assoc.    | Comparison (cannot chain `a < b < c`)          |
| 11         | `&&`                                               | left          | Logical AND (short-circuit)                    |
| 12         | `\|\|`                                             | left          | Logical OR (short-circuit)                     |
| 13 (lowest)| `=` `+=` `-=` `*=` `/=` `%=` `&=` `\|=` `^=` `<<=` `>>=` | right    | Assignment + compound assignment               |

## Examples

`a + b * c` parses as `a + (b * c)` because `*` binds tighter
than `+`.

`a == b && c == d` parses as `(a == b) && (c == d)` because
`==` binds tighter than `&&`.

`-a + b` parses as `(-a) + b` because unary `-` binds tighter
than `+`.

`a as u64 + b` parses as `(a as u64) + b` because `as` binds
tighter than `+`.

`a < b == c` is a *parse error* because comparison operators
are non-associative — Otigen refuses to compile `a < b == c`
or `a < b < c`. Use explicit parentheses: `(a < b) == c` or
`(a < b) && (b < c)`.

## Operand-type rules

Beyond precedence, each operator imposes type constraints:

- **Arithmetic** (`+`, `-`, `*`, `/`, `%`) requires both
  operands to be the same numeric type. Mixing widths (e.g.
  `u64 + u256`) is a compile error; cast one operand first.
- **Bitwise** (`&`, `|`, `^`, `~`) requires integer operands of
  the same width. The result has the same type.
- **Shifts** (`<<`, `>>`) take an integer left operand and a
  shift count that fits in a `u8`. Overshift (counts ≥ width)
  reverts at runtime.
- **Comparison** (`==`, `!=`, `<`, `>`, `<=`, `>=`) requires
  both operands to be the same type and produces a `bool`.
  Enum values can be compared with `==` and `!=` but not with
  ordering operators.
- **Logical** (`&&`, `||`, `!`) requires `bool` operands and
  produces a `bool`. Short-circuit semantics — the right-hand
  side of `&&` or `||` is not evaluated if the left-hand side
  determines the result.
- **Cast** (`as`) requires a value and an explicit target
  type. Widening is unconditional; narrowing traps if the
  value doesn't fit.
- **Assignment** (`=`, `+=`, etc.) requires the LHS to be a
  storage write target (`self.field`, `self.map[key]`, a
  `mut` local) and the RHS to be type-compatible.

When in doubt, parenthesise. The compiler agrees with the
table above; the human reading your diff in six months may
not.
