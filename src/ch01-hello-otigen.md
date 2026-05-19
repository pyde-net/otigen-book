# Hello, Otigen

This first chapter is short and concrete. We'll set up the tools, generate a
project, look at the starter contract that `pyde-dev` writes for you,
compile it, run its test, and call into it from a script. By the end you
will have written and exercised a real contract — small, but a real one —
and you will know what every file in a Pyde project is for.

If you've used Foundry, the workflow will feel familiar. The Pyde toolchain
deliberately mirrors the Foundry shape: source in `src/`, tests in `test/`,
deployment scripts in `script/`, packages in `lib/`, project config in
`pyde.toml`.

## 1.1 Installing the toolchain

There are two binaries you need:

- **`otic`** — the Otigen compiler. Reads `.oti` source, emits a `.pyc`
  artifact (bytecode + ABI + metadata).
- **`pyde-dev`** — the project tool. Scaffolds projects, runs `otic` over a
  whole `src/` tree, executes tests inside an embedded PVM, formats source,
  deploys to networks.

Both are Rust binaries built from the Pyde polyrepo. While `pyde install`
is not yet on a public package index, you can build them from source.
Assuming you have a stable Rust toolchain:

```sh
git clone https://github.com/pyde-net/otic.git
git clone https://github.com/pyde-net/dev.git
git clone https://github.com/pyde-net/engine.git

cargo install --path dev
cargo install --path otic
```

Confirm they're on your `$PATH`:

```sh
otic --version
pyde-dev --version
```

If both report a version number you're ready. If either reports
"command not found", check that `~/.cargo/bin` is on your `PATH`.

## 1.2 Creating a project

`pyde-dev init` scaffolds a new project:

```sh
pyde-dev init hello_otigen
```

You'll see a tree like this:

```text
hello_otigen/
├── pyde.toml
├── src/
│   └── Counter.oti
├── test/
│   └── Counter.test.oti
├── script/
└── lib/
    └── @std/
        ├── vm.oti
        ├── token.oti
        └── math.oti
```

A quick tour:

- **`pyde.toml`** is the project manifest — name, version, compiler
  settings, the list of networks `pyde-dev` knows how to deploy to.
- **`src/`** holds your contracts. Each top-level `.oti` file can contain
  one or more contracts.
- **`test/`** holds tests. A test file is itself an Otigen contract whose
  functions are tagged `#[test]`; `pyde-dev test` runs each one inside an
  embedded PVM and reports the result.
- **`script/`** holds deployment + migration scripts. Each script is an
  Otigen contract that calls `deploy!` on the contracts you want to push
  to a network.
- **`lib/@std/`** is Otigen's standard library, copied into your project
  on init. You'll learn what each module exposes later; for now the
  contents do not matter.

## 1.3 Reading the starter contract

Open `src/Counter.oti`:

```otigen
contract Counter {
    storage {
        count: u64,
    }

    #[constructor]
    pub fn init() {
        self.count = 0;
    }

    pub fn get_count() -> u64 {
        return self.count;
    }

    pub fn increment() {
        self.count = self.count + 1;
    }

    pub fn add(value: u64) {
        self.count = self.count + value;
    }
}
```

Twenty lines, and they already exhibit half of Otigen's surface. Let's
walk through them.

```otigen
contract Counter {
```

Every deployable unit lives inside a `contract` block. The name of the
block is the contract's name in the ABI and in deployment scripts.

```otigen
    storage {
        count: u64,
    }
```

Persistent state goes in the `storage { ... }` block. Fields look like
struct fields — a name, a colon, a type. The compiler assigns each field a
storage slot at compile time, so you never write a slot number by hand and
you never have to worry about two fields colliding. `u64` is an unsigned
64-bit integer; `Counter` will be unable to hold values larger than 2⁶⁴−1.

```otigen
    #[constructor]
    pub fn init() {
        self.count = 0;
    }
```

`#[constructor]` marks a function that runs exactly once, at deploy time.
It is the only place where the *contract itself* gets its initial state.
After deployment the constructor disappears from the dispatch table — it
can never be called by a transaction.

```otigen
    pub fn get_count() -> u64 {
        return self.count;
    }
```

`pub` means "callable from outside the contract via the ABI". A function
without `pub` is internal: callable only from other functions in the
same contract. `-> u64` declares the return type.

You may notice this function reads storage but does not declare that.
You will see in [Chapter 9](ch09-view-payable-constructor.md) that functions
that only read should be marked `#[view]`. The starter omits the
attribute on purpose — it's the smallest correct contract — but in
production code you'd add it. We'll revisit this exact contract once we
introduce attributes formally.

```otigen
    pub fn increment() {
        self.count = self.count + 1;
    }

    pub fn add(value: u64) {
        self.count = self.count + value;
    }
```

Two state-mutating functions. Note `self.count + 1` — that is *checked*
arithmetic. If `self.count` were already `u64::MAX`, this transaction
would revert. Otigen has no `unchecked { }` escape hatch; if you want
wrapping, you must do it explicitly with bitwise ops.

## 1.4 Reading the starter test

Open `test/Counter.test.oti`:

```otigen
use counter::Counter;

contract CounterTest {
    #[test]
    pub fn counter_starts_at_zero() {
        let c = Counter::new();
        assert!(c.get_count() == 0);
    }

    #[test]
    pub fn increment_adds_one() {
        let c = Counter::new();
        c.increment();
        assert!(c.get_count() == 1);
    }

    #[test]
    pub fn add_n() {
        let c = Counter::new();
        c.add(10);
        c.add(5);
        assert!(c.get_count() == 15);
    }
}
```

A test file is just a contract with `#[test]` functions. Each test deploys
a fresh `Counter` (`Counter::new()` runs the constructor and returns a
typed handle), exercises it, and uses `assert!` to declare the expected
post-condition. Each `#[test]` runs in its own isolated PVM instance — no
state bleeds between tests.

## 1.5 Building and testing

From the project root:

```sh
pyde-dev build
```

This compiles every `.oti` file under `src/`, writing each contract's
`.pyc` artifact to `out/`. If the compile fails, you'll see diagnostics
with file/line locations — they look like Rust compiler errors and read
the same way.

To run the tests:

```sh
pyde-dev test
```

You should see something like:

```text
Counter.test.oti::counter_starts_at_zero    PASS  (gas: 28_140)
Counter.test.oti::increment_adds_one        PASS  (gas: 41_926)
Counter.test.oti::add_n                     PASS  (gas: 56_318)

  3 passed, 0 failed
```

The gas number is the actual gas consumed inside the embedded PVM —
exactly what the contract would consume on-chain. Tests are not
approximations; they exercise the same VM your deployment will hit.

## 1.6 Deploying with a script

The third top-level directory is `script/`. Create `script/Deploy.oti`:

```otigen
use counter::Counter;

contract Deploy {
    pub fn run() {
        let counter = deploy! Counter::new();
        // The address is printed by the deploy script runner.
    }
}
```

`deploy!` is a built-in macro that constructs a contract on-chain. It
returns a typed handle (`Contract<Counter>`) you can call further methods
on if your script wants to interact with the freshly-deployed instance.

Run the script against the bundled devnet:

```sh
pyde-dev script script/Deploy.oti:Deploy --network devnet
```

`devnet` is a network alias defined in your `pyde.toml`. If you haven't
edited the manifest, it points at a local node that `pyde-dev` will start
for you. The output ends with the deployed contract's address — note it
down; you'll need it to call the contract from external clients.

## 1.7 What you just did

In about sixty lines of code (and not many more lines of CLI) you:

- Defined a stateful smart contract with a constructor and three public
  methods.
- Wrote three property tests that boot the contract in a fresh VM,
  exercise it, and check post-conditions.
- Compiled the contract to PVM bytecode.
- Deployed it to a local network.

You also met the parts of Otigen that show up in every contract:
`contract`, `storage`, `pub fn`, `#[constructor]`, `#[test]`, `assert!`,
`deploy!`, and `self`.

The next chapter zooms in on the anatomy of a contract — every section
that can appear inside the `contract { ... }` braces, what each one does,
and how they fit together. After that, [Chapter 3](ch03-common-syntax.md)
walks through Otigen's syntax for expressions, statements, and control
flow, which works the same inside and outside of contracts.
