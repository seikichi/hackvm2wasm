// TODO: define WASM intruction types, not using string...
const wat = {
  module: (s: string[]) => `(module ${s.join(" ")})`,
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
  loop: (ins: string[]) => `loop ${ins.join(" ")} end`,
  if: (ins: string[]) => `if ${ins.join(" ")} end`,
  i32: {
    const: (n: number) => `i32.const ${n}`,
    add: () => "i32.add",
    sub: () => "i32.sub",
    eq: () => "i32.eq",
  },
  br: (n: number) => `br ${n}`,
  br_if: (n: number) => `br_if ${n}`,
};

export default wat;
