# The JSON schema

When `pyde-dev build` finishes, every contract produces a
`.pyc` artifact. The artifact has several sections — the
bytecode, the storage layout, the metadata — and one of them is
the *ABI*: a JSON document that describes the contract's
public surface.

This section walks through the ABI's structure with a worked
example. Tooling reading the JSON should expect every field
described here; tooling generating the JSON (i.e. the compiler)
produces exactly this shape.

## Top-level structure

```json
{
  "contract": "PydeToken",
  "functions": [ ... ],
  "events": [ ... ],
  "errors": [ ... ],
  "storage": [ ... ],
  "structs": [ ... ],
  "enums": [ ... ]
}
```

Six top-level keys. The contract name; arrays for each kind of
declaration. We'll walk through each.

## `contract`

A string with the contract's source name (the identifier
inside `contract Name { ... }`). One ABI document per
contract; if a file declares multiple contracts, the build
emits one `.pyc` per contract.

## `functions`

An array of objects, one per `pub fn` (including the
constructor if any):

```json
{
  "name": "transfer",
  "selector": "0xa9059cbb",
  "params": [
    { "name": "to",     "type": "Address" },
    { "name": "amount", "type": "u256" }
  ],
  "returns": null,
  "view": false,
  "payable": false,
  "constructor": false,
  "reentrant": false,
  "doc": "Transfer `amount` tokens from msg.sender to `to`."
}
```

Field by field:

- **`name`** — the function name as it appears in source.
- **`selector`** — the 4-byte selector as a hex string. See
  [the previous section](ch14-01-selectors.md).
- **`params`** — array of `{name, type}` objects, in
  declaration order. The `type` is a string that matches
  Otigen's type syntax (`u256`, `Address`, `String`, `Vec<u8>`,
  `Map<K, V>` would be invalid here — maps aren't passable —
  but struct names and tuple types are).
- **`returns`** — the return type as a string, or `null` if
  the function has no return value. For a tuple return,
  `"(u256, u256)"`.
- **`view`** — `true` if the function is `#[view]`. Tools use
  this to mark queries as gas-free.
- **`payable`** — `true` if the function is `#[payable]`.
  Tools use this to allow or refuse value attachment.
- **`constructor`** — `true` if the function is the
  `#[constructor]`. Exactly zero or one function per contract
  has this set to `true`.
- **`reentrant`** — `true` if the function is `#[reentrant]`.
  Mostly informational; auditing tools care.
- **`doc`** — the `///` doc-comment text, or `null` if there
  isn't one. Verbatim, including newlines.

A `#[receive]` or `#[fallback]` function gets a similar entry
but with `name: "receive"` / `name: "fallback"` and no
selector field (the runtime dispatches them by attribute, not
by selector).

## `events`

An array of objects, one per `event` declaration:

```json
{
  "name": "Transfer",
  "fields": [
    { "name": "from",   "type": "Address", "indexed": true },
    { "name": "to",     "type": "Address", "indexed": true },
    { "name": "amount", "type": "u256",    "indexed": false }
  ],
  "doc": null
}
```

Each event has a name, an ordered list of fields, and an
optional doc comment. Each field is `{name, type, indexed}`.
Tools use the `indexed` flag to know which fields land in
receipt topics (see [Chapter 7.2](ch07-02-indexed.md)).

The wire encoding of an emitted event:

- **Topic 0** = FNV-1a hash of the event name (32 bytes,
  padded to U256).
- **Topics 1, 2, 3** = the indexed fields, in declaration
  order, each as 32 bytes.
- **Data** = the non-indexed fields, ABI-encoded
  (fixed-and-dynamic).

If the event declares more than 3 indexed fields, only the
first 3 go into topics; the extras are placed into the data
section. (As covered in [Chapter 7.2](ch07-02-indexed.md), this
is a footgun — the parser doesn't currently reject the extras.)

## `errors`

An array of objects, one per `error` declaration:

```json
{
  "name": "InsufficientBalance",
  "fields": [
    { "name": "available", "type": "u256" },
    { "name": "required",  "type": "u256" }
  ],
  "doc": null
}
```

Each error has a name, an ordered list of fields, and an
optional doc comment. No `indexed` flag on error fields — all
fields go into the revert data.

The wire encoding of a revert:

- **First 4 bytes** = FNV-1a hash of the error name (the *error
  selector*).
- **Remaining bytes** = the fields, ABI-encoded in declaration
  order.

For a zero-field error (`error TransferToZeroAddress {}`), the
payload is just the 4-byte selector — 4 bytes total. We covered
the encoding in [Chapter 6.3](ch06-03-decoding-revert.md).

## `storage`

An array of objects, one per storage field:

```json
{ "name": "balances", "type": "Map<Address, u256>", "slot": 4 }
```

Each storage field has a name, a type string, and a slot index.
The slot index is the value the compiler assigned to the field
(see [Chapter 4.3](ch04-03-slot-layout.md)). Indexers and
storage explorers use this to render contract state in a
human-readable form.

## `structs` and `enums`

Arrays of user-defined types declared in the contract:

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
    "name": "Mode",
    "variants": ["Open", "Locked", "Capped"]
  }
]
```

Tools that decode function returns, event payloads, or revert
data use these to know how to render values of user types. A
function whose return type is `Position` produces 64 bytes (32
for `holder` + 32 for `size`), and the tool needs the `structs`
entry to know how to split them.

## Where the ABI lives

The ABI is one of several sections inside the `.pyc` artifact:

- `SECTION_CONSTRUCTOR_BYTECODE` (type 1) — the constructor's
  PVM bytecode.
- `SECTION_RUNTIME_BYTECODE` (type 2) — the runtime PVM
  bytecode (everything that runs after deployment).
- `SECTION_ABI` (type 3) — the JSON ABI described in this
  section.
- `SECTION_METADATA` (type 4) — compiler version, source hash,
  and reproducibility data.

Tooling that just wants the ABI extracts section 3 and parses
it as JSON.

## A small example end-to-end

For the contract:

```otigen
contract Counter {
    storage {
        count: u64,
    }

    event Incremented { #[indexed] who: Address, new_count: u64 }

    pub fn increment() {
        self.count = self.count + 1;
        emit Incremented { who: msg.sender, new_count: self.count };
    }

    #[view]
    pub fn get() -> u64 {
        return self.count;
    }
}
```

The ABI JSON looks roughly:

```json
{
  "contract": "Counter",
  "functions": [
    {
      "name": "increment",
      "selector": "0x...",
      "params": [],
      "returns": null,
      "view": false,
      "payable": false,
      "constructor": false,
      "reentrant": false,
      "doc": null
    },
    {
      "name": "get",
      "selector": "0x...",
      "params": [],
      "returns": "u64",
      "view": true,
      "payable": false,
      "constructor": false,
      "reentrant": false,
      "doc": null
    }
  ],
  "events": [
    {
      "name": "Incremented",
      "fields": [
        { "name": "who",       "type": "Address", "indexed": true  },
        { "name": "new_count", "type": "u64",     "indexed": false }
      ],
      "doc": null
    }
  ],
  "errors": [],
  "storage": [
    { "name": "count", "type": "u64", "slot": 0 }
  ],
  "structs": [],
  "enums": []
}
```

You can inspect a contract's ABI directly with `pyde-dev`:

```sh
$ pyde-dev abi out/Counter.pyc
{
  "contract": "Counter",
  ...
}
```

## Summary

The ABI is a JSON document with six top-level keys: contract,
functions, events, errors, storage, structs, enums. Each
function entry carries name, selector, params, returns, and
the attribute booleans (view, payable, constructor, reentrant).
Each event has fields with names, types, and an indexed flag.
Each error has fields with names and types. Each storage field
records the compiler-assigned slot index. The whole document
lives in section 3 of the `.pyc` artifact.

The [next section](ch14-03-versioning.md) covers what counts as
a breaking change once an ABI is deployed.
