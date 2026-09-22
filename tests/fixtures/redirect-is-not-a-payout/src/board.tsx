type GroupDropLocation = { columnId: string; index: number };

export type BoardProps = {
  handleOnDrop: (source: GroupDropLocation, destination: GroupDropLocation) => Promise<void>;
};

export function Board({ handleOnDrop }: BoardProps) {
  return null;
}
