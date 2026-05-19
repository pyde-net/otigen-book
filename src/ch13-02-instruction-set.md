# The instruction set

The PVM recognises roughly 45 opcodes. They fall into nine
groups; this section takes them in order. You won't memorise the
opcodes — the compiler emits them for you — but knowing the
shape of the categories helps when you're reading bytecode or
estimating gas.

## Instruction format

Every PVM instruction is a fixed-width 32-bit word with the
shape:

```text
+--------+----+----+-------------------+
| opcode | rd | rs1| rs2 OR immediate  |
| 6 bits | 4  | 4  |       18 bits     |
+--------+----+----+-------------------+
```

So every instruction names one destination register, one source
register, and either a second source register or an 18-bit
immediate value. The 18-bit immediate is sign-extended by the
decoder, giving a range of −131,072 to 131,071. Values that
don't fit in the immediate field require a separate constant-
loading instruction.

## 1. Arithmetic

The bread-and-butter group:

```text
Add  rd, rs1, rs2     // rd = rs1 + rs2 (u64; checked)
Sub  rd, rs1, rs2     // rd = rs1 - rs2 (u64; checked)
Mul  rd, rs1, rs2     // rd = rs1 * rs2 (u64; checked)
Div  rd, rs1, rs2     // rd = rs1 / rs2 (u64; traps on zero)
Mod  rd, rs1, rs2     // rd = rs1 % rs2 (u64; traps on zero)
Addi rd, rs1, imm     // rd = rs1 + imm  (immediate form)
```

Every arithmetic op carries the checked semantics from
[Chapter 11](ch11-00-checked-arithmetic.md): overflow or
underflow traps with `Trap::ArithmeticOverflow`, division by
zero traps with `Trap::DivisionByZero`.

The opcode numbers for orientation: `Add = 0x01`, `Sub = 0x02`,
`Mul = 0x03`. The full table is in
[Appendix C](appendix-c-builtins.md).

## 2. Bitwise and comparison

```text
And  rd, rs1, rs2     // rd = rs1 & rs2
Or   rd, rs1, rs2     // rd = rs1 | rs2
Xor  rd, rs1, rs2     // rd = rs1 ^ rs2
Not  rd, rs1          // rd = !rs1
Shl  rd, rs1, rs2     // rd = rs1 << rs2 (traps on overshift)
Shr  rd, rs1, rs2     // rd = rs1 >> rs2 (logical)
Sar  rd, rs1, rs2     // rd = rs1 >> rs2 (arithmetic / sign-extended)
Lt   rd, rs1, rs2     // rd = (rs1 < rs2)   ? 1 : 0  (unsigned)
Gt   rd, rs1, rs2     // rd = (rs1 > rs2)   ? 1 : 0  (unsigned)
Eq   rd, rs1, rs2     // rd = (rs1 == rs2)  ? 1 : 0
Slt  rd, rs1, rs2     // rd = (rs1 < rs2)   ? 1 : 0  (signed)
Sgt  rd, rs1, rs2     // rd = (rs1 > rs2)   ? 1 : 0  (signed)
```

Comparison opcodes produce a `0`/`1` GP-register value. They're
fed into the branch instructions below.

## 3. Wide-register operations

The same shapes, but operating on 256-bit values held in
`w0`–`w7`:

```text
Wadd  wd, ws1, ws2    // 256-bit add (checked)
Wsub  wd, ws1, ws2    // 256-bit sub
Wmul  wd, ws1, ws2    // 256-bit mul
Wdiv  wd, ws1, ws2    // 256-bit div
Wmod  wd, ws1, ws2    // 256-bit mod
Wand  wd, ws1, ws2    // 256-bit bitwise AND
Wor   wd, ws1, ws2    // 256-bit bitwise OR
Wxor  wd, ws1, ws2    // 256-bit bitwise XOR
Wnot  wd, ws1         // 256-bit bitwise NOT
Wshift wd, ws1, rs2   // 256-bit shift (count from GP register)
Weq   rd, ws1, ws2    // 256-bit equality → GP register
Wlt   rd, ws1, ws2    // 256-bit less-than → GP register
```

Wide arithmetic costs about 2× a GP equivalent (we covered this
in [Chapter 11.3](ch11-03-gas-cost.md)). The compiler picks the
narrowest type that fits the source value, so you won't see wide
ops unless the source actually uses `u256` / `i256` / `Address`.

## 4. Memory

```text
Load   rd, [rs1+imm]    // GP load from memory address rs1+imm
Store  [rs1+imm], rs2   // GP store
Wload  wd, [rs1+imm]    // 256-bit load (8 sequential 64-bit cells)
Wstore [rs1+imm], ws    // 256-bit store
Wmov   wd, ws           // 256-bit register-to-register
Narrow rd, ws           // wide → GP (drops upper 192 bits; traps if non-zero)
Widen  wd, rs           // GP → wide (zero-extends)
Memcpy [rd], [rs1], n   // copy n bytes
```

`Push` and `Pop` exist as convenience wrappers around `Store`
and `Load` against a stack pointer. The compiler uses them for
function-prologue spills.

## 5. Control flow

```text
Jmp   target              // unconditional jump
Beq   rs1, rs2, target    // branch if rs1 == rs2
Bne   rs1, rs2, target    // branch if rs1 != rs2
Blt   rs1, rs2, target    // branch if rs1 < rs2
Bge   rs1, rs2, target    // branch if rs1 >= rs2
Call  target              // push return address, jump
Ret                       // pop return address, jump
```

Branches use the comparison instructions' output (`0`/`1`) as
the condition. The compiler lowers `if`, `while`, `for`, and
`match` to these primitives.

## 6. Storage

```text
Sload  wd, rs1     // wd = storage[rs1]  (rs1 is the key)
Sstore rs1, ws     // storage[rs1] = ws
Sdelete rs1        // storage[rs1] = 0 (refund-on-zero)
```

The storage opcodes hide the slot-derivation we covered in
[Chapter 4.3](ch04-03-slot-layout.md): the runtime hashes
`(contract_address, slot_index, key)` internally; the bytecode
only sees the final 256-bit key.

`Sstore` charges the SSTORE cost (fresh vs. modify vs. no-op
detected by the runtime); `Sdelete` is the "write zero and
refund" form.

## 7. Environment

These read values from the execution context. The opcodes match
the built-in globals from [Chapter 3.2](ch03-02-data-types.md):

```text
Caller     wd       // msg.sender → wd
Callvalue  wd, mode // msg.value (or another env value, by mode)
Blockhash  wd, rs1  // hash of block rs1 → wd
CallExt    ...      // cross-contract call (lowering of Interface::at calls)
Delegate   ...      // delegatecall variant
Create     ...      // deploy! lowering
Selfdestruct        // contract self-destruct
Log        ...      // event emit
Revert     ...      // revert with payload
Halt                // end execution successfully
```

The Callvalue opcode has a `mode` field (encoded in the
immediate) that selects which environment value to read —
`msg.value`, `tx.gas_price`, `tx.nonce`, `tx.hash`,
`tx.gas_limit`, `block.height`, `block.timestamp`,
`block.anchor`, `address(self)`, `gas_remaining`. So one opcode
covers all the built-in globals through a small dispatch.

## 8. Crypto

```text
Poseidon       wd, [rs1+imm]   // Poseidon2 hash → wd
VerifySig      rd, [rs1+imm]   // verify a FALCON-512 signature
MerkleVerify   rd, ...         // verify a Merkle inclusion proof
```

The Poseidon2 opcode is the workhorse — it's what
`hash(...)` lowers to in user code, and what the runtime uses
to derive storage slots. `VerifySig` and `MerkleVerify` are
specialised primitives used by multisig and bridge contracts.

## 9. Utility

```text
Assert  rs1            // trap if rs1 == 0
Memcpy  [rd], [rs1], n // n-byte memory copy
```

`Assert` is the lowering of `assert!(cond)`. `Memcpy` is the
implementation behind larger structural moves (returning a
struct, copying a calldata buffer).

## Walking through a tiny program

Take the smallest Otigen function:

```otigen
fn add_one(x: u64) -> u64 {
    return x + 1;
}
```

Compiles to roughly:

```text
;; r2 holds x (first parameter)
Addi r1, r2, 1   ;; r1 = r2 + 1 (overflow-checked)
Ret              ;; pop the return address, jump
```

Two instructions. The `Addi r1, r2, 1` form uses the immediate
field (the `1`), avoiding a separate constant-load instruction.
The result lands in `r1`, the return-value register. `Ret`
unwinds the frame.

## Summary

The PVM has 45 opcodes across nine groups: arithmetic, bitwise/
comparison, wide-register, memory, control flow, storage,
environment, crypto, utility. Each is a fixed-width 32-bit
instruction with one destination, one source, and either a
second source or an 18-bit immediate. The compiler emits these
from your Otigen source; you never write them by hand. Knowing
the shape helps when you're reading disassembled bytecode or
reasoning about a function's gas profile.

The [next section](ch13-03-call-abi.md) covers the conventions
that make function calls work — how arguments arrive, how
returns come back, and how selector dispatch wires external
calls to the right function.
