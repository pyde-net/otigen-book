# Hello, `pyde-dev`!

`pyde-dev` is Otigen's project tool. It plays the same role that Cargo
plays for Rust or Foundry plays for Solidity: it scaffolds new
projects, runs the compiler across an entire `src/` tree, executes
tests inside an embedded virtual machine, formats source files, and
deploys finished contracts to a network.

Most non-trivial Otigen work happens inside a `pyde-dev` project, not
in a single `.oti` file. Let's see why.

## Creating a project with `pyde-dev init`

If you're still in the `hello_otigen` directory from the previous
section, step out of it:

```sh
$ cd ..
```

Now scaffold a new project:

```sh
$ pyde-dev init counter
  Initialized project 'counter'

  counter/
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

  Get started:
    cd counter
    pyde-dev build
    pyde-dev test
```

`pyde-dev init counter` created a directory called `counter` and
populated it with a working skeleton: a starter contract, a starter
test, a project manifest, and the standard library.

## Project layout

Let's look at each top-level entry:

* `pyde.toml` — the *project manifest*. Names your project, pins
  compiler settings, lists deployable networks. Equivalent to `Cargo.toml`
  in Rust or `foundry.toml` in Foundry.
* `src/` — your contracts. Each top-level `.oti` file may contain one
  or more contracts.
* `test/` — your tests. A test file is just an Otigen contract whose
  functions are tagged `#[test]`.
* `script/` — your deployment and migration scripts. A deployment
  script is itself a contract with a `run()` entry point.
* `lib/@std/` — Otigen's standard library, copied into your project at
  init time. Modules cover token primitives, math helpers, and VM
  intrinsics. Pin against the project so projects are reproducible
  without a network.

Move into the project:

```sh
$ cd counter
```

## Reading `pyde.toml`

Open `pyde.toml`:

<span class="filename">Filename: pyde.toml</span>

```toml
[project]
name = "counter"
version = "0.1.0"

[compiler]
optimize = true
src = "src"
test = "test"
out = "out"

[networks.devnet]
rpc = "http://127.0.0.1:8545"
```

`name` and `version` identify the project. `[compiler]` tells `pyde-dev`
where to find sources, where to write artifacts, and whether to ask
`otic` to optimize. `[networks]` lists destinations a deployment
script can target by name.

You won't need to edit `pyde.toml` very often.

## Reading the starter contract

Open `src/Counter.oti`:

<span class="filename">Filename: src/Counter.oti</span>

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

This is bigger than the `Hello` contract from the previous section. Two
new pieces show up:

* A `storage { ... }` block that declares *persistent state*. Anything
  in here lives on-chain between calls. Here we have one field,
  `count`, of type `u64` (an unsigned 64-bit integer).
* A `#[constructor]` function. Constructors run *once*, at deployment
  time. After the contract is deployed, the constructor is unreachable
  — no caller can invoke it again. This is where deploy-time inputs
  flow into state.

Two patterns we'll see throughout the book also appear:

* `self.count` reads or writes the storage field named `count`.
* `pub fn ... -> u64` declares a return type. A function without
  `->` returns nothing.

We'll dig into [storage](ch04-00-storage-and-maps.md) and
[function attributes](ch08-00-attributes.md) in their own chapters.
For now, recognise the shape: storage on top, the constructor next,
the methods after.

## Building

From inside the `counter` directory, run:

```sh
$ pyde-dev build
   Compiling Counter.oti
   Wrote out/Counter.pyc

   1 contract built (15ms)
```

`pyde-dev build` walks `src/`, hands every `.oti` file to `otic`, and
puts the resulting `.pyc` artifacts in `out/`. If you change a source
file and rebuild, only the affected contracts recompile.

## Reading and running the test

Open `test/Counter.test.oti`:

<span class="filename">Filename: test/Counter.test.oti</span>

```otigen
use counter::Counter;

contract CounterTest {
    #[test]
    fn test_deploy() {
        let c = deploy!(Counter);
        assert!(c.get_count() == 0);
    }

    #[test]
    fn test_increment() {
        let c = deploy!(Counter);
        c.increment();
        assert!(c.get_count() == 1);
    }

    #[test]
    fn test_add() {
        let c = deploy!(Counter);
        c.add(10);
        c.add(5);
        assert!(c.get_count() == 15);
    }
}
```

`use counter::Counter;` imports the contract from our `src/` directory.
Each `#[test]` function deploys a fresh `Counter` with `deploy!(Counter)`
(this calls the constructor and gives back a typed handle), then
exercises it. Tests are *internal* functions — note that they're
declared with `fn`, not `pub fn`; the test runner promotes them
internally. Tests are isolated:
each one gets its own clean virtual machine, so state never leaks
between them.

Run them with:

```sh
$ pyde-dev test
   Compiling Counter.test.oti

CounterTest::test_deploy        PASS  (gas: 28_140)
CounterTest::test_increment     PASS  (gas: 41_926)
CounterTest::test_add           PASS  (gas: 56_318)

  3 passed, 0 failed (38ms)
```

Each test reports the gas it consumed. That number is exact — the
test ran the same bytecode and the same VM your deployment will run,
so the gas accounting matches production. We'll revisit the gas
model in [Chapter 11](ch11-03-gas-cost.md).

## A first script

Let's deploy the contract. Create a file called `script/Deploy.oti`:

<span class="filename">Filename: script/Deploy.oti</span>

```otigen
use counter::Counter;

contract Deploy {
    pub fn run() {
        let counter = deploy!(Counter);
        // The deployer prints the address.
    }
}
```

`deploy!` is a built-in macro that constructs a contract on-chain and
returns a typed handle (`Contract<Counter>`) you can call further
methods on. If the constructor takes arguments, pass them after the
contract name: `deploy!(Counter, arg1, arg2)`. If the constructor is
`#[payable]`, attach a value: `deploy!(Counter, arg, value: 1000)`.
Run the script against your local devnet:

```sh
$ pyde-dev script script/Deploy.oti:Deploy --network devnet
   Deploying Counter -> 0xa1b2c3...
   Deploy complete (gas: 124_580)
```

We're done for now. You've installed the tooling, written a
program in two different shapes, used `pyde-dev` to scaffold and
build a project, watched a test suite pass, and deployed a contract
to a local network. That's enough of the mechanics; let's now write
something a little more interesting.
