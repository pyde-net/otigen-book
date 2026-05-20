# The JSON schema

Every contract you compile produces a `.json` artifact in `out/`. The
artifact is a single JSON document — no binary sections, no
length-prefixed framing, just a plain JSON object whose keys are
the contract's name, its bytecode, its ABI, and its storage
layout.

This section walks through the structure with a real example
produced by the compiler. Tooling reading the JSON should expect
every field described here; tooling generating the JSON (i.e. the
compiler) produces exactly this shape.

## A worked example: the starter `Counter`

`pyde-dev init`'s starter `Counter` contract:

```otigen
contract Counter {
    storage {
        count: u64,
    }

    #[constructor]
    pub fn init() {
        self.count = 0;
    }

    pub fn get_count() -> u64 { return self.count; }
    pub fn increment()        { self.count = self.count + 1; }
    pub fn add(value: u64)    { self.count = self.count + value; }
}
```

After `pyde-dev build`, `out/Counter.json` looks like this (the
bytecode is truncated for display):

```json
{
  "contractName": "Counter",
  "compiler": "otic 0.1.0",
  "bytecode": "0x0000013b040030...74000000b0",
  "constructorBytecode": "0x0000013b040030...8038000000b0",
  "deployedBytecode": "0x02005443957b...8038feffc33b0000fcf902001c8400000078",
  "instructionCount": 139,
  "selectors": {
    "0xd9e32bf7": "get_count",
    "0x3812e73e": "increment",
    "0x3b391274": "add"
  },
  "abi": {
    "contract": "Counter",
    "functions": [
      {
        "name": "init",
        "selector": "0x00000000",
        "params": [],
        "returns": "()",
        "view": false,
        "payable": false,
        "constructor": true,
        "reentrant": false
      },
      { "name": "get_count",  "selector": "0xd9e32bf7", "params": [],
        "returns": "u64", "view": false, "payable": false,
        "constructor": false, "reentrant": false },
      { "name": "increment",  "selector": "0x3812e73e", "params": [],
        "returns": "()",  "view": false, "payable": false,
        "constructor": false, "reentrant": false },
      { "name": "add",        "selector": "0x3b391274",
        "params": [{ "name": "value", "type": "u64" }],
        "returns": "()", "view": false, "payable": false,
        "constructor": false, "reentrant": false }
    ],
    "events":  [],
    "errors":  [],
    "storage": [
      { "name": "count", "type": "u64", "slot": 0 }
    ],
    "structs": [],
    "enums":   []
  },
  "storage": [
    { "name": "count", "type": "u64", "slot": 0 }
  ]
}
```

Let's walk through each top-level field.

## Top-level fields

### `contractName`

The contract's source name. Single string. This is also what
`out/<Name>.json` is named after — one artifact per contract.

### `compiler`

A version string identifying the compiler that produced this
artifact. Useful for debugging when an artifact compiled with an
older version is loaded by a newer tool (or vice versa).

### `bytecode`

The full PVM bytecode as a `0x`-prefixed hex string. This is what
gets sent to the chain at deploy time. It's the concatenation of
the constructor bytecode and the deployed bytecode, in that order.

### `constructorBytecode`

Just the constructor portion of the bytecode. This is what the
runtime executes at deployment, then discards. Empty (`"0x"`) if
the contract has no `#[constructor]` function — though in practice
the compiler emits a minimal constructor that zero-initialises
storage even when no source-level constructor is declared.

### `deployedBytecode`

The runtime portion — what gets stored at the contract's address
and runs on every subsequent call. This is what other contracts
calling yours actually invoke. Tools that compare deployed
bytecode against source-built bytecode (`pyde-dev verify`) compare
this field.

### `instructionCount`

The number of PVM instructions in the bytecode. Useful for
sizing analyses and gas estimation.

### `selectors`

A map from 4-byte hex selectors to function names — the *inverse*
of what's also inside `abi.functions`. This is the lookup tooling
uses when it receives a calldata blob: the first 4 bytes are the
selector; look them up here to find which function was being
called.

The map *does not* include the constructor (selector
`0x00000000` is reserved and the constructor isn't reachable via
selector dispatch post-deploy).

### `abi`

The structured ABI. This is what most off-chain tooling reads. It
nests under the top-level artifact rather than being the top
level itself — see the next section for the full structure.

### `storage` (top-level)

A duplicate of `abi.storage`, available at the top level for
convenience. Tooling that just wants the storage layout (a
storage explorer, an indexer) can read it without diving into
the `abi` block.

## The `abi` sub-object

```json
"abi": {
  "contract": "Counter",
  "functions": [ ... ],
  "events":    [ ... ],
  "errors":    [ ... ],
  "storage":   [ ... ],
  "structs":   [ ... ],
  "enums":     [ ... ]
}
```

Seven keys. `contract` echoes the contract's name; the rest are
arrays.

### `abi.functions`

One entry per `pub fn` in the contract, *plus* the constructor
(which has selector `0x00000000` and `constructor: true`).

```json
{
  "name":        "transfer",
  "selector":    "0xa9059cbb",
  "params":      [
    { "name": "to",     "type": "Address" },
    { "name": "amount", "type": "u256" }
  ],
  "returns":     "()",
  "view":        false,
  "payable":     false,
  "constructor": false,
  "reentrant":   false
}
```

- **`name`** — the function name as it appears in source.
- **`selector`** — the 4-byte selector as a hex string. See
  [the previous section](ch14-01-selectors.md).
- **`params`** — array of `{name, type}` objects, in
  declaration order. The `type` field is a string matching
  Otigen's type syntax (`u256`, `Address`, `String`,
  `Vec<u8>`); struct names and tuple types appear here too.
- **`returns`** — a type string. `"()"` means "no return
  value"; a regular type like `"u256"` or a tuple
  `"(u256, u256)"` is the value's type.
- **`view`** — `true` if the function is `#[view]`. Tools use
  this to mark queries as gas-free.
- **`payable`** — `true` if the function is `#[payable]`.
  Tools use this to allow or refuse value attachment.
- **`constructor`** — `true` if the function is the
  `#[constructor]`. Exactly zero or one function per contract
  has this set to `true`.
- **`reentrant`** — `true` if the function is `#[reentrant]`.
  Mostly informational; auditing tools care.

A `#[receive]` or `#[fallback]` function appears in the array
with a corresponding role marker. The current artifact format
doesn't include a `doc` field — `///` doc comments are parsed
but not yet preserved into the artifact.

### `abi.events`

One entry per `event` declaration:

```json
{
  "name": "Transfer",
  "fields": [
    { "name": "from",   "type": "Address", "indexed": true  },
    { "name": "to",     "type": "Address", "indexed": true  },
    { "name": "amount", "type": "u256",    "indexed": false }
  ]
}
```

Each event has a name and an ordered list of fields. Each
field is `{name, type, indexed}`. Tools use the `indexed` flag
to know which fields land in receipt topics (see
[Chapter 7.2](ch07-02-indexed.md)).

### `abi.errors`

One entry per `error` declaration:

```json
{
  "name": "InsufficientBalance",
  "fields": [
    { "name": "available", "type": "u256" },
    { "name": "required",  "type": "u256" }
  ]
}
```

Same shape as events without the `indexed` flag — every error
field lives in revert data.

### `abi.storage`

The storage layout:

```json
{ "name": "count", "type": "u64", "slot": 0 }
```

Each field has a name, a type string, and the compiler-assigned
slot index (covered in [Chapter 4.3](ch04-03-slot-layout.md)).
Indexers and storage explorers use this to render contract
state in a human-readable form.

### `abi.structs` and `abi.enums`

User-defined types declared in the contract:

```json
"structs": [
  {
    "name": "Position",
    "fields": [
      { "name": "holder", "type": "Address" },
      { "name": "size",   "type": "u256" }
    ]
  }
],
"enums": [
  {
    "name":     "Mode",
    "variants": ["Open", "Locked", "Capped"]
  }
]
```

Tools that decode function returns, event payloads, or revert
data use these to know how to render values of user types. A
function whose return type is `Position` produces 64 bytes
(32 for `holder` + 32 for `size`); the tool needs the `structs`
entry to know how to split them.

## Inspecting an artifact

The artifact is a plain JSON file — every tool that speaks JSON
can read it. For quick inspection, `jq` is the natural fit:

```sh
$ jq '.abi.functions' out/Counter.json
$ jq '.selectors' out/Counter.json
{
  "0xd9e32bf7": "get_count",
  "0x3812e73e": "increment",
  "0x3b391274": "add"
}
```

`otic abi <file>` also pretty-prints the ABI section:

```sh
$ otic abi out/Counter.json
```

## Summary

The `.json` artifact has nine top-level fields:
`contractName`, `compiler`, `bytecode`, `constructorBytecode`,
`deployedBytecode`, `instructionCount`, `selectors`, `abi`, and
`storage` (which echoes `abi.storage` at the top level for
convenience). The `abi` field is a nested object with seven
sub-keys for the contract name plus arrays for functions,
events, errors, storage, structs, and enums. Function entries
carry name, selector, params, returns, and the attribute
booleans. Each contract produces one `.json`, named after the
contract.

The [next section](ch14-03-versioning.md) covers what counts
as a breaking change once an ABI is deployed.
