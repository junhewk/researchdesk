export async function* readNdjson(
  stream: AsyncIterable<Buffer | string>,
  onError?: (line: string, err: unknown) => void,
): AsyncGenerator<unknown> {
  let buffer = "";

  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed);
      } catch (err) {
        onError?.(trimmed, err);
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim());
    } catch (err) {
      onError?.(buffer.trim(), err);
    }
  }
}

export async function* readLines(
  stream: AsyncIterable<Buffer | string>,
): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      yield line;
    }
  }

  if (buffer) {
    yield buffer;
  }
}
