# The register file

The PVM is a *register machine*: every instruction reads its
operands from registers and writes its result to a register.
There's no operand stack the way Wasm or the EVM have. The
register file is small enough to hold in your head and large
enough to hold a function's working set without spilling.

## Two banks of registers

The PVM has two register banks:

- **16 general-purpose 64-bit registers**, named `r0`–`r15`. Hold
  any value that fits in 64 bits — counters, indices, addresses
  treated as opaque words, the lower-order portion of larger
  values.
- **8 wide 256-bit registers**, named `w0`–`w7`. Hold values that
  don't fit in 64 bits — `u256` token balances, `Address` values
  (32 bytes), hash outputs.

Two registers are conventionally reserved:

- **`r0`** is hardwired to *zero*. Reading `r0` always returns
  `0`; writing to `r0` has no effect. This is the same convention
  RISC-V uses, and it makes "compare to zero" instructions free
  (`Beq r0, x, target` is a perfectly good "branch if x is zero").
- **`r1`** is the *return-value register*. Functions that return a
  GP-sized value leave it in `r1` on exit. The caller reads it
  there.

For wide values:

- **`w7`** is conventionally a *scratch register*. The compiler
  uses it for temporaries within an instruction sequence and
  doesn't expect it to survive across calls. If you're reading
  bytecode and see `w7` used aggressively, that's why.

The remaining registers (`r2`–`r15`, `w0`–`w6`) are free for
general use. The compiler allocates them per function with a
standard register-allocation pass.

## What survives a call

When function A calls function B, every PVM register is
*caller-clobbered* — the callee may freely overwrite any of
them. If A needs a value to survive the call, it must save the
value to memory or storage *before* the call and reload it
*after*.

The compiler handles this for you. When you write:

```otigen
fn user_function() {
    let x = compute_something();
    let y = other_function();
    return x + y;
}
```

the compiler tracks that `x` needs to survive the
`other_function()` call, allocates a memory slot for it, and
emits the spill/reload around the call. You never write the
spill code by hand.

The caller-clobbered convention keeps the PVM ABI simple. There
are no "callee-saved" registers that the callee has to preserve;
the compiler does whatever's cheapest.

## The program counter

A separate 32-bit *program counter* (PC) holds the address of
the next instruction to execute. PVM instructions are
fixed-width 32 bits each, so the PC advances by 4 bytes per
instruction by default. Branches and calls update the PC to a
target address; the runtime checks that target addresses are
inside the contract's bytecode (no jumping outside).

## The frame pointer

The PVM maintains a *frame pointer* (`fp`) for the call stack —
an internal register that tracks the start of the current
function's local-variable area in memory. Each `Call` pushes a
new frame; each `Ret` pops one. You don't manipulate `fp`
directly from Otigen; the compiler emits the frame setup and
teardown as part of the function prologue and epilogue.

## Memory

Beyond registers, the PVM has a *linear address space* of memory
— typically a few KB per execution context. Values that don't
fit in registers (long byte strings, dynamic-size structs, large
vectors) live here. The compiler treats memory as scratch space
for the duration of a function; nothing in memory survives across
calls (unlike storage, which is persistent).

You can read and write memory via the `Load` and `Store`
opcodes; the compiler emits these when an Otigen value spills
out of registers.

## Storage

Beyond memory, the PVM connects to the chain's *persistent
storage* via the `Sload` and `Sstore` opcodes. These are the
expensive operations: a storage read costs ~100 gas, a storage
write thousands. We covered the storage model in
[Chapter 4](ch04-00-storage-and-maps.md); the PVM-level view is
that storage is a global key→value store that survives the
transaction.

## How registers map to source

For everyday Otigen code, the mapping between source-level
variables and PVM registers is straightforward:

- `let x: u64 = ...` — `x` lives in one of `r2`–`r15`.
- `let y: u256 = ...` — `y` lives in one of `w0`–`w6`.
- `let owner: Address = ...` — `owner` lives in one of
  `w0`–`w6` (addresses are 256-bit values).
- Function parameters arrive in `r2`–`r(1+N)` (GP types) and
  `w0`–`w(K-1)` (wide types), in declaration order.

The compiler doesn't expose register names to your source; you
never write `r5 = 1`. But when you read disassembled bytecode,
the mapping above is what you'll see.

## Summary

The PVM has 16 GP-64 registers (r0 is zero, r1 is the return
value) and 8 wide-256 registers (w7 is scratch). All registers
are caller-clobbered — the compiler spills survivors to memory
across calls. A separate program counter and frame pointer
manage control flow and the call stack. Memory holds spill
slots and dynamic data; storage holds persistent state.

The [next section](ch13-02-instruction-set.md) tours the
instruction set that operates on these registers.
