# Errors and Reverts

A contract can succeed or it can revert. When it reverts, all
storage writes made during the transaction are rolled back, the
caller gets back a *revert payload* that says what went wrong, and
no events emitted in the failed branch survive. Reverts are
Otigen's primary failure-signalling mechanism.

This chapter covers three things:

- How to *declare* the errors a contract can revert with — the
  `error` keyword, which we've used in passing.
- How to *raise* an error — the `require!` and `revert!` macros.
- How a *caller* reads the revert payload that comes back from a
  failed cross-contract call.

By the end of the chapter you'll be able to design typed errors
that compose cleanly with downstream tooling: indexers that
count failure rates, dashboards that display human-readable
reasons, contracts that handle specific upstream failures
differently.
