import { compile } from "../compiler";
import { parse } from "../hackvm";

let imports: { js: { mem: WebAssembly.Memory; sleep: (_ms: number) => void } };

beforeEach(() => {
  const mem = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  const sleep = (_ms: number) => {};
  imports = { js: { mem, sleep } };
});

test("simple add", async () => {
  const commands = parse(`
    function test 0
      push constant 7
      push constant 8
      add
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(15);
});

test("simple comparison", async () => {
  const commands = parse(`
    function test 0
      push constant 892
      push constant 891
      gt
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(-1);
});

test("simple arithmetic", async () => {
  const commands = parse(`
    function test 0
      push constant 57
      push constant 31
      push constant 53
      add
      push constant 112
      sub
      neg
      and
      push constant 82
      or
      not
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(-91);
});

test("local and argument", async () => {
  const commands = parse(`
    function test 1
      // local[0] = argument[0] + argument[1]
      push argument 0
      push argument 1
      add
      pop local 0

      // argument[0] = local[0]
      // argument[1] = local[0]
      push local 0
      pop argument 0
      push local 0
      pop argument 1

      // argument[0] + argument[1]
      push argument 0
      push argument 1
      add
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test(1, 20)).toBe(42);
});

test("pointer, this, that", async () => {
  const commands = parse(`
    function test 0
      push constant 3030
      pop pointer 0
      push constant 3040
      pop pointer 1
      push constant 32
      pop this 2
      push constant 46
      pop that 6
      push pointer 0
      push pointer 1
      add
      push this 2
      sub
      push that 6
      add
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(6084);

  const buf = new Int16Array(imports.js.mem.buffer);
  expect(buf[3032]).toBe(32);
  expect(buf[3046]).toBe(46);
});

test("temp", async () => {
  const commands = parse(`
    function test 0
      push constant 1
      pop temp 0
      push constant 2
      pop temp 1
      push constant 3
      pop temp 2
      push constant 4
      pop temp 3
      push constant 5
      pop temp 4
      push constant 6
      pop temp 5
      push constant 7
      pop temp 6
      push constant 8
      pop temp 7
      push temp 0
      push temp 1
      push temp 2
      push temp 3
      push temp 4
      push temp 5
      push temp 6
      push temp 7
      add
      add
      add
      add
      add
      add
      add
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(36);
});

test("static", async () => {
  const commands = parse(`
    function test 0
      push constant 1
      pop static 0
      push constant 41
      pop static 10
      push static 10
      push static 0
      add
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(42);
});

test("simple function", async () => {
  const commands = parse(`
    function f1 0
      push argument 0
      push argument 1
      add
      return

    function f2 0
      push argument 0
      push argument 1
      call f1 2
      return

    function test 0
      push constant 1
      push constant 41
      call f2 2
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test()).toBe(42);
});

test("multiple static", async () => {
  const class1 = parse(`
    function Class1.set 0
    push argument 0
    pop static 0
    push argument 1
    pop static 1
    push constant 0
    return

    // Returns static[0] - static[1].
    function Class1.get 0
    push static 0
    push static 1
    sub
    return
  `);
  const class2 = parse(`
    function Class2.set 0
    push argument 0
    pop static 0
    push argument 1
    pop static 1
    push constant 0
    return

    // Returns static[0] - static[1].
    function Class2.get 0
    push static 0
    push static 1
    sub
    return
  `);
  const sys = parse(`
    function Sys.init 0
    push constant 6
    push constant 8
    call Class1.set 2
    pop temp 0 // Dumps the return value
    push constant 23
    push constant 15
    call Class2.set 2
    pop temp 0 // Dumps the return value
    call Class1.get 0
    call Class2.get 0
    add // (6 - 8) + (23 - 15) = 6
    return
  `);

  const compiled = await compile([class1, class2, sys]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e["Sys.init"]()).toBe(6);
});

test("label, goto, if-goto: mult", async () => {
  const commands = parse(`
    function mult 2
      push constant 0
      pop local 0
      push argument 1
      pop local 1

      label LOOP
      push constant 0
      push local 1
      eq
      if-goto END

      push local 0
      push argument 0
      add
      pop local 0
      push local 1
      push constant 1
      sub
      pop local 1
      goto LOOP

      label END
      push local 0
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.mult(6, 111)).toBe(666);
});

test("basic loop", async () => {
  const commands = parse(`
    function test 1
      // Computes the sum 1 + 2 + ... + argument[0] and pushes the
      // result onto the stack. Argument[0] is initialized by the test
      // script before this code starts running.
      push constant 0
      pop local 0         // initializes sum = 0

      label LOOP_START
      push argument 0
      push local 0
      add
      pop local 0	        // sum = sum + counter
      push argument 0
      push constant 1
      sub
      pop argument 0      // counter--
      push argument 0
      if-goto LOOP_START  // If counter != 0, goto LOOP_START

      push local 0
      return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e.test(10)).toBe(55);
});

test("nested call", async () => {
  const commands = parse(`
    function Sys.main 5
    push constant 4001
    pop pointer 0
    push constant 5001
    pop pointer 1
    push constant 200
    pop local 1
    push constant 40
    pop local 2
    push constant 6
    pop local 3
    push constant 123
    call Sys.add12 1
    pop temp 0
    push local 0
    push local 1
    push local 2
    push local 3
    push local 4
    add
    add
    add
    add
    return

    function Sys.add12 0
    push constant 4002
    pop pointer 0
    push constant 5002
    pop pointer 1
    push argument 0
    push constant 12
    add
    return
    `);

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e["Sys.main"]()).toBe(246);
});

test("fibonacci", async () => {
  const main = parse(`
  function Main.fibonacci 0
  push argument 0
  push constant 2
  lt                     // checks if n<2
  if-goto IF_TRUE
  goto IF_FALSE
  label IF_TRUE          // if n<2, return n
  push argument 0
  return
  label IF_FALSE         // if n>=2, returns fib(n-2)+fib(n-1)
  push argument 0
  push constant 2
  sub
  call Main.fibonacci 1  // computes fib(n-2)
  push argument 0
  push constant 1
  sub
  call Main.fibonacci 1  // computes fib(n-1)
  add                    // returns fib(n-1) + fib(n-2)
  return
    `);
  const sys = parse(`
  function Sys.init 0
  push constant 4
  call Main.fibonacci 1   // computes the 4'th fibonacci element
  return
  `);

  const compiled = await compile([main, sys]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e["Sys.init"]()).toBe(3);
});

test("r = 8000; r[0] = 2 + 3", async () => {
  const commands = parse(
    `
    function Main.main 1
    push constant 8000
    pop local 0
    push constant 2
    push constant 3
    add
    push local 0
    push constant 0
    add
    pop pointer 1
    pop that 0
    push constant 0
    return
    `
  );

  const compiled = await compile([commands]);
  const instance = new WebAssembly.Instance(compiled, imports);

  const e = instance.exports as any;
  expect(e["Main.main"]()).toBe(0);

  const buf = new Int16Array(imports.js.mem.buffer);
  expect(buf[8000]).toBe(5);
});
