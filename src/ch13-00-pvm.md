# The PVM

Otigen source compiles to *PVM bytecode* — the instruction stream
of the **Pyde Virtual Machine**. Every contract that runs on
Pyde runs as PVM bytecode, and every detail of the language we've
covered so far — checked arithmetic, storage slot derivation,
event encoding, the reentrancy guard — lowers to PVM
instructions.

You don't need to know the PVM to write Otigen contracts. The
compiler handles the lowering; the bytecode is opaque. But a
working mental model of the machine you're targeting helps with
two things:

- **Reading other people's bytecode.** When you're auditing a
  contract whose source you don't have, or debugging a `.pyc`
  artifact, you'll meet PVM instructions in the wild.
- **Reasoning about gas costs.** Every Otigen expression compiles
  to a known number of PVM instructions. Once you can see the
  shape, you can estimate the cost.

This chapter is a tour, not a reference. The three sections cover:

- [The register file](ch13-01-register-file.md) — the registers
  the PVM provides and what survives a call.
- [The instruction set](ch13-02-instruction-set.md) — a grouped
  walk through the ~45 opcodes the PVM recognises.
- [The call ABI](ch13-03-call-abi.md) — how arguments and
  returns cross the boundary, and how selector dispatch works.

If you want the full opcode reference rather than the tour, it's
in [Appendix C](appendix-c-builtins.md).
