# Paginate

Idoimatic Typescript API for iterating over any paginated data.

## Motivation

When working with paginated APIs or data sources, developers often need to:

1. Handle both offset-based and cursor-based pagination
2. Deal with errors gracefully without breaking the entire data fetch
3. Repeat boilerplate pagination logic
4. Manage state between pagination requests

This library solves these problems by providing a simple async iterator that handles all the complexity of pagination while giving you complete control over error handling.

## Installation

```bash
npm install @pushpress/paginate
# or
yarn add @pushpress/paginate
# or
pnpm add @pushpress/paginate
```

## Usage

### Basic Offset-based Pagination

```typescript
import { paginate } from "paginate";

// Create an async iterator over your paginated data
const iterator = paginate(
  async ({ limit, offset }) => {
    const response = await fetch(`/api/items?limit=${limit}&offset=${offset}`);
    const data = await response.json();

    return {
      items: data.items,
      pageInfo: {
        hasNextPage: data.items.length === limit,
      },
    };
  },
  {
    strategy: "offset",
    limit: 10,
    errorPolicy: { type: "throw" },
  },
);

// Iterate over all items
for await (const item of iterator) {
  console.log(item);
}
```

### Cursor-based Pagination with Error Handling

```typescript
const iterator = paginate(
  async ({ limit, cursor }) => {
    const response = await fetch(
      `/api/items?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`,
    );
    const data = await response.json();

    return {
      items: data.items,
      pageInfo: {
        hasNextPage: data.hasMore,
        nextCursor: data.nextCursor,
      },
    };
  },
  {
    strategy: "cursor",
    limit: 25,
    errorPolicy: {
      type: "continue",
      maxErrorCount: 3,
      onError: async (error) => {
        // Log errors but continue pagination
        console.error("Pagination error:", error);
      },
    },
  },
);

for await (const item of iterator) {
  // proces item
  await processItem(item);
}
```

## Fluent Interface

The `paginate()` function returns a `FluentAsyncIterable<T>` that implements both `AsyncIterable<T>` natively AND provides a fluent interface with methods for chaining operations.

### Basic Fluent Usage

```typescript
import { paginate } from "@pushpress/paginate";

// Traditional async iteration still works
for await (const user of paginate(getUsersCallback, options)) {
  console.log(user.name);
}

// NEW: Fluent interface for data processing
const activeUserEmails = await paginate(getUsersCallback, {
  strategy: "offset",
  limit: 10,
  errorPolicy: { type: "throw" },
})
  .filter((user) => user.isActive)
  .map((user) => user.email.toLowerCase())
  .toArray();
```

### Iterable Wrapper Methods

**Transformation Methods** (return new `FluentAsyncIterable`):

- `.filter(predicate)` - Filter items
- `.map(transform)` - Transform items
- `.take(count)` - Take first N items
- `.skip(count)` - Skip first N items

**Terminal Methods** (execute and return results):

- `.toArray()` - Collect all items into an array
- `.toSet()` - Collect unique items into a Set
- `.toMap(keyFn)` - Collect items into a Map using a key function
- `.forEach(fn)` - Execute a function for each item
- `.reduce(reducer, initialValue)` - Reduce items to a single value
- `.find(predicate)` - Find first matching item
- `.some(predicate)` - Test if any items match
- `.every(predicate)` - Test if all items match

### Examples

**Data Processing Pipeline:**

```typescript
// Process user data with multiple transformations
const processedUsers = await paginate(getUsersCallback, options)
  .filter((user) => user.isActive && user.email)
  .map(async (user) => ({
    ...user,
    displayName: `${user.name} (${user.age} years old)`,
    emailDomain: user.email.split("@")[1],
  }))
  .filter((user) => user.age >= 18)
  .toArray();
```

**Creating Lookup Structures:**

```typescript
// Create a Map of active users by ID
const userMap = await paginate(getUsersCallback, options)
  .filter((user) => user.isActive)
  .toMap((user) => user.id);

// Get unique email domains
const emailDomains = await paginate(getUsersCallback, options)
  .map((user) => user.email.split("@")[1])
  .toSet();
```

**Early Termination:**

```typescript
// Find first user over 30
const matureUser = await paginate(getUsersCallback, options).find(
  (user) => user.age > 30,
);

// Check if any users are inactive
const hasInactiveUsers = await paginate(getUsersCallback, options).some(
  (user) => !user.isActive,
);

// Take only first 5 users
const firstFive = await paginate(getUsersCallback, options).take(5).toArray();
```

**Aggregation:**

```typescript
// Calculate average age of active users
const avgAge = await paginate(getUsersCallback, options)
  .filter((user) => user.isActive)
  .reduce((sum, user, index) => {
    return index === 0 ? user.age : (sum * index + user.age) / (index + 1);
  }, 0);
```

**Mixed Usage:**

```typescript
// Use fluent methods to filter, then iterate manually
const activeUsers = paginate(getUsersCallback, options)
  .filter((user) => user.isActive)
  .filter((user) => user.age >= 30);

for await (const user of activeUsers) {
  await processUser(user);
}
```

**Error Handling with Fluent Interface:**

```typescript
// Fluent interface works seamlessly with error policies
const results = await paginate(callback, {
  strategy: "offset",
  limit: 10,
  errorPolicy: {
    type: "continue",
    maxErrorCount: 3,
  },
})
  .filter((item) => item.isValid)
  .map((item) => processItem(item))
  .toArray();
```

## Functional Utilities

For functional programming enthusiasts, all fluent methods are also available as standalone utility functions:

```typescript
import {
  paginate,
  filter,
  map,
  take,
  toArray,
  toSet,
  find,
} from "@pushpress/paginate";

// Functional composition style
const result = await toArray(
  take(
    map(
      filter(paginate(callback, options), (user) => user.isActive),
      (user) => user.email.toLowerCase(),
    ),
    10,
  ),
);

// All utilities support both sync and async predicates/transforms
const asyncFiltered = filter(
  paginate(callback, options),
  async (user) => await validateUser(user),
);
```

## API

### `paginate<T>(callback, options)`

Creates a `FluentAsyncIterable<T>` that yields items from a paginated data source.

#### Callback Parameters

```typescript
type PaginationCallback<T> = (params: {
  limit: number;
  offset?: number;
  cursor?: string | null;
}) => Promise<{
  items: T[];
  pageInfo: {
    hasNextPage: boolean;
    nextCursor?: string | null;
  };
}>;
```

#### Options

```typescript
type PaginationOptions = {
  strategy: "offset" | "cursor";
  limit: number;
  initialOffset?: number; // For offset-based pagination
  initialCursor?: string | null; // For cursor-based pagination
  logger?: Logger; // Optional logger interface
  errorPolicy: ErrorPolicy;
};

type ErrorPolicy =
  | {
      type: "continue";
      maxErrorCount: number;
      onError?: (error: unknown) => void | Promise<void>;
    }
  | {
      type: "throw";
    }
  | {
      type: "break";
      onError?: (error: unknown) => void | Promise<void>;
    }
  | {
      type: "custom";
      handler: (
        error: unknown,
        context: { consecutiveErrors: number },
      ) => boolean | Promise<boolean>;
    };
```

## Error Handling Strategies

The library provides four error handling strategies:

1. **Continue** (`{ type: "continue", maxErrorCount, onError? }`): Attempts to continue pagination after errors, but stops if too many consecutive errors occur. Optional error callback for logging or monitoring.

2. **Break** (`{ type: "break", onError? }`): Stops iteration silently on error. Optional error callback for cleanup or logging.

3. **Throw** (`{ type: "throw" }`): Throws errors immediately, stopping iteration.

4. **Custom** (`{ type: "custom", handler }`): Provides full control over error handling decisions.

### Error Callback Handling

Error callbacks can be specified per policy type:

```typescript
const iterator = paginate(callback, {
  strategy: "offset",
  limit: 10,
  errorPolicy: {
    type: "continue",
    maxErrorCount: 3,
    onError: async (error) => {
      await reportError(error);
      await cleanup();
    },
  },
});

// Or with break policy
const iterator2 = paginate(callback, {
  strategy: "offset",
  limit: 10,
  errorPolicy: {
    type: "break",
    onError: async (error) => {
      await notifyUser("Pagination stopped due to error");
    },
  },
});
```

### Custom Error Handling

The custom error policy allows you to implement complex error handling logic:

```typescript
const iterator = paginate(callback, {
  strategy: "offset",
  limit: 10,
  errorPolicy: {
    type: "custom",
    handler: async (error, { consecutiveErrors }) => {
      // Log error to monitoring service
      await reportError(error);

      // Rate limiting logic
      if (error instanceof RateLimitError) {
        await delay(1000);
        return consecutiveErrors <= 3; // retry up to 3 times
      }

      // Network error handling
      if (error instanceof NetworkError) {
        const isHealthy = await checkServiceHealth();
        return isHealthy && consecutiveErrors < 5;
      }

      return false; // break for other errors
    },
  },
});
```

The custom handler receives:

- The error that occurred
- Context including the number of consecutive errors

It must return (or resolve to):

- `true`: Continue pagination
- `false`: Stop pagination

## Best Practices

1. **Choose the right pagination strategy**:
   - Use offset-based for small to medium datasets with random access needs
   - Use cursor-based for large datasets or real-time data

2. **Set appropriate limits**: Balance network requests with memory usage

3. **Handle errors appropriately**:
   - Use "continue" with `maxErrorCount` for resilient data processing
   - Use "break" for optional data that can be partial
   - Use "throw" for critical data that must be complete and when errors are expected
   - Use "custom" for complex error handling requirements

4. **Use error callbacks effectively**:
   - Log errors for monitoring and debugging
   - Clean up resources when pagination stops
