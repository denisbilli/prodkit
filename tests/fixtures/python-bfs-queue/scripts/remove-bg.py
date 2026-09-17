from collections import deque


def flood_fill(pixels, width, height, start):
    """A breadth-first fill. The queue here is a local variable, not a job system."""
    queue: deque[tuple[int, int]] = deque()
    queue.append(start)

    def maybe_enqueue(x: int, y: int) -> None:
        if 0 <= x < width and 0 <= y < height:
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        maybe_enqueue(x + 1, y)
        maybe_enqueue(x, y + 1)

    return pixels
