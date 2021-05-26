// TODO: define WASM intruction types, not using string...
const wat = {
  module: (s: string[]) => `(module ${s.join(" ")})`,
  import: (s1: string, s2: string, s3: string) =>
    `(import "${s1}" "${s2}" ${s3})`,
  memory: (n1: number, n2: number) => `(memory ${n1} ${n2})`,
  func: (name: string, s: string[]) => `(func ${name} ${s.join(" ")})`,
  export: (name: string) => `(export "${name}")`,
  param: (type: string) => `(param ${type})`,
  result: (type: string) => `(result ${type})`,
  local: (() => {
    const local = (type: string) => `(local ${type})`;
    local.get = (n: number) => `local.get ${n}`;
    local.set = (n: number) => `local.set ${n}`;
    return local;
  })(),
  block: (ins: string[]) => `block ${ins.join(" ")} end`,
  loop: (name: string, ins: string[]) => `loop ${name} ${ins.join(" ")} end`,
  if: (ins: string[]) => `if ${ins.join(" ")} end`,
  i32: {
    const: (n: number) => `i32.const ${n}`,
    add: () => "i32.add",
    sub: () => "i32.sub",
    eq: () => "i32.eq",
    gt_s: () => "i32.gt_s",
    lt_s: () => "i32.lt_s",
    and: () => "i32.and",
    or: () => "i32.or",
    xor: () => "i32.xor",
    mul: () => "i32.mul",
    load: (offset: number) => `i32.load offset=${offset}`,
    store: (offset: number) => `i32.store offset=${offset}`,
  },
  global: {
    get: (name: string) => `global.get ${name}`,
    set: (name: string) => `global.set ${name}`,
  },
  br: (n: number | string) => `br ${n}`,
  br_if: (n: number) => `br_if ${n}`,
  br_table: (ns: number[]) => `br_table ${ns.join(" ")}`,
  return: () => `return`,
  call: (name: string) => `call ${name}`,
  select: () => `select`,
};

export default wat;
