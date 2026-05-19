# Access lists and parallel execution

> **Status:** stub — to be written.

The deep dive on Pyde's distinctive feature. How the compiler infers each function's storage access list from the typed storage block, how the scheduler reads those lists to parallelise non-conflicting transactions, and what makes an access pattern statically resolvable vs requiring runtime speculation. The contract-author's view: how your code shapes the parallelism the runtime can exploit.
