/**
 * A type that represents the action to take when an error occurs during pagination.
 */
export type ErrorAction = "continue" | "break" | "throw";

/**
 * A type that represents whether to continue or break the pagination process on an error.
 */
export type ShouldContinue = boolean;

export type ErrorPolicy =
  | {
      type: "continue";
      maxErrorCount: number;
    }
  | {
      type: "throw";
    }
  | { type: "break" }
  | {
      type: "custom";
      handler: (
        error: unknown,
        context: { consecutiveErrors: number },
      ) => ShouldContinue | Promise<ShouldContinue>;
    };

type OnPageOptions = {
  offset?: number;
  cursor?: string | null;
};

/**
 * Hooks for pagination for logging and debugging etc
 */
export type PaginationHooks = {
  onPage?: (options: OnPageOptions) => void | Promise<void>;
  onReturn?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onMaxConsecutiveErrors?: (
    error: unknown,
    context: { errors: number },
  ) => void | Promise<void>;
};

/**
 * Offset-based pagination options
 */
export type OffsetPaginationOptions = {
  strategy: "offset";
  limit: number;
  errorPolicy: ErrorPolicy;
  initialOffset?: number | null;
  hooks?: PaginationHooks;
};

/**
 * Cursor-based pagination options
 */
export type CursorPaginationOptions = {
  strategy: "cursor";
  limit: number;
  errorPolicy: ErrorPolicy;
  initialCursor?: string | null;
  hooks?: PaginationHooks;
};

export type PaginationOptions =
  | OffsetPaginationOptions
  | CursorPaginationOptions;

export type PageInfo = {
  hasNextPage: boolean;
  nextCursor?: string | null;
};

export type PaginatedResult<T> = {
  items: T[];
  pageInfo: PageInfo;
};

// Type for the callback function that fetches data
export type PaginationCallback<T> = (params: {
  limit: number;
  offset?: number;
  cursor?: string | null;
}) => Promise<PaginatedResult<T>>;

/**
 * Creates an async generator for paginating through data using either offset or cursor-based pagination
 * @param callback Function that fetches paginated data
 * @param options Pagination configuration options
 *
 * @example
 * const offsetIter = paginate(
 *   async ({ limit, offset }) => {
 *     // Fetch data using offset-based pagination
 *     return {
 *       items: ["item1", "item2"],
 *       pageInfo: {
 *         hasNextPage: true,
 *       },
 *     };
 *   },
 *   {
 *     strategy: "offset",
 *     limit: 10,
 *     onError: async (error) => {
 *       console.error("Error during pagination:", error);
 *     },
 *     errorPolicy: "continue"
 *   },
 * );
 *
 * for await (const item of offsetIter) {
 *   console.log(item);
 * }
 *
 * const cursorItems = paginate(
 *   async ({ limit, cursor }) => {
 *     // Fetch data using cursor-based pagination
 *     return {
 *       items: ["item1", "item2"],
 *       pageInfo: {
 *         hasNextPage: true,
 *         nextCursor: "next-page-cursor",
 *       },
 *     };
 *   },
 *   {
 *     strategy: "cursor",
 *     limit: 10,
 *     onError: async (error) => {
 *       console.error("Error during pagination:", error);
 *     },
 *     errorPolicy: "break"
 *   },
 * );
 *
 * for await (const item of cursorItems) {
 *   console.log(item);
 * }
 */
export async function* paginate<T>(
  callback: PaginationCallback<T>,
  options: PaginationOptions,
): AsyncIterableIterator<T> {
  const { limit } = options;

  let consecutiveErrorCount = 0;
  let currentOffset =
    (options.strategy === "offset" ? options.initialOffset : 0) ?? 0;
  let currentCursor =
    options.strategy === "cursor" ? options.initialCursor : null;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- we make sure to have yeild and break conditions here
  while (true) {
    if (options.hooks?.onPage) {
      await options.hooks.onPage({
        offset: currentOffset,
        cursor: currentCursor,
      });
    }

    const params = {
      limit,
      ...(options.strategy === "offset"
        ? { offset: currentOffset }
        : { cursor: currentCursor }),
    };

    try {
      const result = await callback(params);

      yield* result.items;

      if (!result.pageInfo.hasNextPage) {
        await options.hooks?.onReturn?.();
        break;
      }

      if (options.strategy === "offset") {
        currentOffset += limit;
      } else {
        currentCursor = result.pageInfo.nextCursor;
      }
      consecutiveErrorCount = 0;
      continue;
    } catch (error) {
      consecutiveErrorCount++;

      // determine error action
      let action: ErrorAction;
      switch (options.errorPolicy.type) {
        case "throw":
          action = "throw";
          break;
        case "break":
          if (options.hooks?.onError) {
            try {
              await options.hooks.onError(error); // Call onError callback with the error
            } catch {
              await options.hooks.onReturn?.();
              return;
            }
          }
          action = "break";
          await options.hooks?.onReturn?.();
          return; // Break the loop if error policy is break
        case "continue": {
          if (options.hooks?.onError) {
            try {
              await options.hooks.onError(error); // Call onError callback with the error
            } catch {
              await options.hooks.onReturn?.();
              return;
            }
          }

          const maxErrorCountExceeded =
            consecutiveErrorCount >= options.errorPolicy.maxErrorCount;

          if (maxErrorCountExceeded) {
            await options.hooks?.onMaxConsecutiveErrors?.(error, {
              errors: consecutiveErrorCount,
            });
          }

          action = maxErrorCountExceeded ? "break" : "continue";
          break;
        }
        case "custom": {
          const shouldContinue = await options.errorPolicy.handler(error, {
            consecutiveErrors: consecutiveErrorCount,
          });
          action = shouldContinue ? "continue" : "break";
          break;
        }
      }

      // execute error action
      switch (action) {
        case "throw":
          throw error; // Throw the error if errorPolicy is set to "throw"
        case "break":
          await options.hooks?.onReturn?.();
          return; // Break the loop if error policy is break
        case "continue":
          // For offset strategy, still increment the offset to avoid getting stuck
          if (options.strategy === "offset") {
            currentOffset += limit;
          }
          continue;
      }
    }
  }
}
