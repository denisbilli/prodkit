export interface BoardState {
  items: string[];
}

export function reducer(oldState: BoardState, action: { item: string }): BoardState {
  const newState = { items: [...oldState.items, action.item] };
  return newState;
}

export function repriced(change: { old_price: number; new_price: number }) {
  return change.new_price - change.old_price;
}

export function diff(record: Record<string, object>) {
  const before = record.old_values;
  const after = record.new_values;
  return JSON.stringify(before) !== JSON.stringify(after);
}
