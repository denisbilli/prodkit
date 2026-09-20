export function compileRules(list) {
  return list.map((rule) => ({ ...rule, compiled: true }));
}
