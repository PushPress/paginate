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
  cursor?: string | number | null;
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
 * A fluent async iterable that implements AsyncIterable<T> and provides chainable utility methods
 */
export class FluentAsyncIterable<T> implements AsyncIterable<T> {
  constructor(private iterable: AsyncIterable<T>) {}

  // Implement AsyncIterable interface
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.iterable[Symbol.asyncIterator]();
  }

  // Lazy transformation methods (return new FluentAsyncIterable)
  filter(predicate: (item: T, index: number) => boolean | Promise<boolean>): FluentAsyncIterable<T> {
    return new FluentAsyncIterable(filter(this.iterable, predicate));
  }

  map<U>(transform: (item: T, index: number) => U | Promise<U>): FluentAsyncIterable<U> {
    return new FluentAsyncIterable(map(this.iterable, transform));
  }

  take(count: number): FluentAsyncIterable<T> {
    return new FluentAsyncIterable(take(this.iterable, count));
  }

  skip(count: number): FluentAsyncIterable<T> {
    return new FluentAsyncIterable(skip(this.iterable, count));
  }

  // Terminal methods (execute and return results)
  async toArray(): Promise<T[]> {
    return toArray(this.iterable);
  }

  async toSet(): Promise<Set<T>> {
    return toSet(this.iterable);
  }

  async toMap<K>(keyFn: (item: T) => K): Promise<Map<K, T>> {
    return toMap(this.iterable, keyFn);
  }

  async forEach(fn: (item: T, index: number) => void | Promise<void>): Promise<void> {
    return forEach(this.iterable, fn);
  }

  async reduce<U>(reducer: (accumulator: U, item: T, index: number) => U | Promise<U>, initialValue: U): Promise<U> {
    return reduce(this.iterable, reducer, initialValue);
  }

  async find(predicate: (item: T, index: number) => boolean | Promise<boolean>): Promise<T | undefined> {
    return find(this.iterable, predicate);
  }

  async some(predicate: (item: T, index: number) => boolean | Promise<boolean>): Promise<boolean> {
    return some(this.iterable, predicate);
  }

  async every(predicate: (item: T, index: number) => boolean | Promise<boolean>): Promise<boolean> {
    return every(this.iterable, predicate);
  }
}

/**
 * Internal async generator for paginating through data using either offset or cursor-based pagination
 */
async function* paginateGenerator<T>(
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

/**
 * Creates a fluent async iterable for paginating through data using either offset or cursor-based pagination
 * @param callback Function that fetches paginated data
 * @param options Pagination configuration options
 * @returns FluentAsyncIterable that can be used with for-await loops or fluent methods
 *
 * @example
 * // Traditional async iteration
 * for await (const item of paginate(callback, options)) {
 *   console.log(item);
 * }
 * 
 * // Fluent interface
 * const items = await paginate(callback, options)
 *   .filter(item => item.isActive)
 *   .map(item => item.name.toUpperCase())
 *   .take(10)
 *   .toArray();
 * 
 * // Mixed usage
 * const activeUsers = paginate(getUsersCallback, options)
 *   .filter(user => user.isActive);
 * 
 * for await (const user of activeUsers) {
 *   await processUser(user);
 * }
 */
export function paginate<T>(
  callback: PaginationCallback<T>,
  options: PaginationOptions,
): FluentAsyncIterable<T> {
  return new FluentAsyncIterable(paginateGenerator(callback, options));
}

/**
 * Collects all items from an async iterable into an array
 * @param iterable The async iterable to collect from
 * @returns Promise that resolves to an array containing all items
 * 
 * @example
 * const items = await toArray(paginate(callback, options));
 * console.log(items); // ['item1', 'item2', ...]
 */
export async function toArray<T>(
  iterable: AsyncIterable<T>,
): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) {
    result.push(item);
  }
  return result;
}

/**
 * Collects all unique items from an async iterable into a Set
 * @param iterable The async iterable to collect from
 * @returns Promise that resolves to a Set containing all unique items
 * 
 * @example
 * const uniqueItems = await toSet(paginate(callback, options));
 * console.log(uniqueItems.size); // Number of unique items
 */
export async function toSet<T>(
  iterable: AsyncIterable<T>,
): Promise<Set<T>> {
  const result = new Set<T>();
  for await (const item of iterable) {
    result.add(item);
  }
  return result;
}

/**
 * Collects items from an async iterable into a Map using a key function
 * @param iterable The async iterable to collect from
 * @param keyFn Function that extracts/generates a key for each item
 * @returns Promise that resolves to a Map with keys generated by keyFn
 * 
 * @example
 * const userMap = await toMap(
 *   paginate(getUsersCallback, options),
 *   user => user.id
 * );
 * console.log(userMap.get('user123')); // User object
 */
export async function toMap<T, K>(
  iterable: AsyncIterable<T>,
  keyFn: (item: T) => K,
): Promise<Map<K, T>> {
  const result = new Map<K, T>();
  for await (const item of iterable) {
    const key = keyFn(item);
    result.set(key, item);
  }
  return result;
}

/**
 * Executes a function for each item in an async iterable
 * @param iterable The async iterable to iterate over
 * @param fn Function to execute for each item
 * @returns Promise that resolves when all items have been processed
 * 
 * @example
 * await forEach(paginate(callback, options), async (item) => {
 *   await processItem(item);
 * });
 */
export async function forEach<T>(
  iterable: AsyncIterable<T>,
  fn: (item: T, index: number) => void | Promise<void>,
): Promise<void> {
  let index = 0;
  for await (const item of iterable) {
    await fn(item, index++);
  }
}

/**
 * Creates a new async iterable with items that pass a test function
 * @param iterable The async iterable to filter
 * @param predicate Function to test each item
 * @returns Async iterable containing only items that pass the test
 * 
 * @example
 * const activeUsers = filter(
 *   paginate(getUsersCallback, options),
 *   user => user.isActive
 * );
 */
export async function* filter<T>(
  iterable: AsyncIterable<T>,
  predicate: (item: T, index: number) => boolean | Promise<boolean>,
): AsyncIterable<T> {
  let index = 0;
  for await (const item of iterable) {
    if (await predicate(item, index++)) {
      yield item;
    }
  }
}

/**
 * Creates a new async iterable with transformed items
 * @param iterable The async iterable to transform
 * @param transform Function to transform each item
 * @returns Async iterable containing transformed items
 * 
 * @example
 * const userEmails = map(
 *   paginate(getUsersCallback, options),
 *   user => user.email
 * );
 */
export async function* map<T, U>(
  iterable: AsyncIterable<T>,
  transform: (item: T, index: number) => U | Promise<U>,
): AsyncIterable<U> {
  let index = 0;
  for await (const item of iterable) {
    yield await transform(item, index++);
  }
}

/**
 * Takes the first n items from an async iterable
 * @param iterable The async iterable to take from
 * @param count Number of items to take
 * @returns Async iterable containing at most count items
 * 
 * @example
 * const first10 = take(paginate(callback, options), 10);
 */
export async function* take<T>(
  iterable: AsyncIterable<T>,
  count: number,
): AsyncIterable<T> {
  if (count <= 0) return;
  
  let taken = 0;
  for await (const item of iterable) {
    yield item;
    if (++taken >= count) break;
  }
}

/**
 * Skips the first n items from an async iterable
 * @param iterable The async iterable to skip from
 * @param count Number of items to skip
 * @returns Async iterable containing items after skipping count items
 * 
 * @example
 * const afterFirst10 = skip(paginate(callback, options), 10);
 */
export async function* skip<T>(
  iterable: AsyncIterable<T>,
  count: number,
): AsyncIterable<T> {
  let skipped = 0;
  for await (const item of iterable) {
    if (skipped++ < count) continue;
    yield item;
  }
}

/**
 * Reduces an async iterable to a single value
 * @param iterable The async iterable to reduce
 * @param reducer Function that combines accumulator with each item
 * @param initialValue Initial value for the accumulator
 * @returns Promise that resolves to the final accumulated value
 * 
 * @example
 * const total = await reduce(
 *   paginate(getOrdersCallback, options),
 *   (sum, order) => sum + order.amount,
 *   0
 * );
 */
export async function reduce<T, U>(
  iterable: AsyncIterable<T>,
  reducer: (accumulator: U, item: T, index: number) => U | Promise<U>,
  initialValue: U,
): Promise<U> {
  let accumulator = initialValue;
  let index = 0;
  for await (const item of iterable) {
    accumulator = await reducer(accumulator, item, index++);
  }
  return accumulator;
}

/**
 * Finds the first item that matches a predicate
 * @param iterable The async iterable to search
 * @param predicate Function to test each item
 * @returns Promise that resolves to the first matching item or undefined
 * 
 * @example
 * const adminUser = await find(
 *   paginate(getUsersCallback, options),
 *   user => user.role === 'admin'
 * );
 */
export async function find<T>(
  iterable: AsyncIterable<T>,
  predicate: (item: T, index: number) => boolean | Promise<boolean>,
): Promise<T | undefined> {
  let index = 0;
  for await (const item of iterable) {
    if (await predicate(item, index++)) {
      return item;
    }
  }
  return undefined;
}

/**
 * Checks if any item matches a predicate
 * @param iterable The async iterable to test
 * @param predicate Function to test each item
 * @returns Promise that resolves to true if any item matches
 * 
 * @example
 * const hasActiveUser = await some(
 *   paginate(getUsersCallback, options),
 *   user => user.isActive
 * );
 */
export async function some<T>(
  iterable: AsyncIterable<T>,
  predicate: (item: T, index: number) => boolean | Promise<boolean>,
): Promise<boolean> {
  let index = 0;
  for await (const item of iterable) {
    if (await predicate(item, index++)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if all items match a predicate
 * @param iterable The async iterable to test
 * @param predicate Function to test each item
 * @returns Promise that resolves to true if all items match
 * 
 * @example
 * const allUsersActive = await every(
 *   paginate(getUsersCallback, options),
 *   user => user.isActive
 * );
 */
export async function every<T>(
  iterable: AsyncIterable<T>,
  predicate: (item: T, index: number) => boolean | Promise<boolean>,
): Promise<boolean> {
  let index = 0;
  for await (const item of iterable) {
    if (!(await predicate(item, index++))) {
      return false;
    }
  }
  return true;
}
