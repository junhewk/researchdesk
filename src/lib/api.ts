export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function parseErrorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return `Request failed (${status})`;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiError(`Request failed (${response.status})`, response.status, text);
      }
      throw new ApiError("Invalid JSON response", response.status, text);
    }
  }

  if (!response.ok) {
    throw new ApiError(
      parseErrorMessage(data, response.status),
      response.status,
      data,
    );
  }

  return data as T;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  return readJsonResponse<T>(response);
}
