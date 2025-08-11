// Approach 1: AsyncIterableWrapper Class
// Wraps any AsyncIterable with fluent methods

class AsyncIterableWrapper<T> {
  constructor(private iterable: AsyncIterable<T>) {}

  // Lazy transformation methods (return new wrappers)
  filter(predicate: (item: T, index: number) => boolean | Promise<boolean>): AsyncIterableWrapper<T> {
    return new AsyncIterableWrapper(filter(this.iterable, predicate));
  }

  map<U>(transform: (item: T, index: number) => U | Promise<U>): AsyncIterableWrapper<U> {
    return new AsyncIterableWrapper(map(this.iterable, transform));
  }

  take(count: number): AsyncIterableWrapper<T> {
    return new AsyncIterableWrapper(take(this.iterable, count));
  }

  skip(count: number): AsyncIterableWrapper<T> {
    return new AsyncIterableWrapper(skip(this.iterable, count));
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

  async reduce<U>(reducer: (acc: U, item: T, index: number) => U | Promise<U>, initialValue: U): Promise<U> {
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

  // Make it async iterable
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.iterable[Symbol.asyncIterator]();
  }
}

// Helper function to wrap any async iterable
export function wrap<T>(iterable: AsyncIterable<T>): AsyncIterableWrapper<T> {
  return new AsyncIterableWrapper(iterable);
}

// Usage example:
/*
const result = await wrap(paginate(callback, options))
  .filter(item => item.isActive)
  .map(item => item.name.toUpperCase())
  .take(10)
  .toArray();
*/

// Approach 2: PaginationBuilder - Builder pattern specific to pagination
class PaginationBuilder<T> {
  private transformations: Array<(iterable: AsyncIterable<any>) => AsyncIterable<any>> = [];

  constructor(
    private callback: PaginationCallback<T>,
    private options: PaginationOptions
  ) {}

  filter<U extends T>(predicate: (item: U, index: number) => boolean | Promise<boolean>): PaginationBuilder<U> {
    this.transformations.push((iterable) => filter(iterable, predicate));
    return this as any;
  }

  map<U>(transform: (item: T, index: number) => U | Promise<U>): PaginationBuilder<U> {
    this.transformations.push((iterable) => map(iterable, transform));
    return this as any;
  }

  take(count: number): PaginationBuilder<T> {
    this.transformations.push((iterable) => take(iterable, count));
    return this;
  }

  skip(count: number): PaginationBuilder<T> {
    this.transformations.push((iterable) => skip(iterable, count));
    return this;
  }

  // Build the final iterable
  build(): AsyncIterable<T> {
    let result: AsyncIterable<any> = paginate(this.callback, this.options);
    for (const transform of this.transformations) {
      result = transform(result);
    }
    return result;
  }

  // Terminal operations
  async toArray(): Promise<T[]> {
    return toArray(this.build());
  }

  async toSet(): Promise<Set<T>> {
    return toSet(this.build());
  }

  async toMap<K>(keyFn: (item: T) => K): Promise<Map<K, T>> {
    return toMap(this.build(), keyFn);
  }

  async forEach(fn: (item: T, index: number) => void | Promise<void>): Promise<void> {
    return forEach(this.build(), fn);
  }

  async reduce<U>(reducer: (acc: U, item: T, index: number) => U | Promise<U>, initialValue: U): Promise<U> {
    return reduce(this.build(), reducer, initialValue);
  }

  async find(predicate: (item: T, index: number) => boolean | Promise<boolean>): Promise<T | undefined> {
    return find(this.build(), predicate);
  }

  async some(predicate: (item: T, index: number) => boolean | Promise<boolean>): Promise<boolean> {
    return some(this.build(), predicate);
  }

  async every(predicate: (item: T, index: number) => boolean | Promise<boolean>): Promise<boolean> {
    return every(this.build(), predicate);
  }
}

// Helper function to create builder
export function buildPagination<T>(
  callback: PaginationCallback<T>,
  options: PaginationOptions
): PaginationBuilder<T> {
  return new PaginationBuilder(callback, options);
}

// Usage example:
/*
const result = await buildPagination(callback, options)
  .filter(item => item.isActive)
  .map(item => ({ ...item, name: item.name.toUpperCase() }))
  .take(10)
  .toArray();
*/

// Approach 3: Pipe utility with function composition
type AsyncIterableTransform<T, U> = (iterable: AsyncIterable<T>) => AsyncIterable<U>;

export function pipe<T>(iterable: AsyncIterable<T>): AsyncIterable<T>;
export function pipe<T, A>(
  iterable: AsyncIterable<T>,
  fn1: AsyncIterableTransform<T, A>
): AsyncIterable<A>;
export function pipe<T, A, B>(
  iterable: AsyncIterable<T>,
  fn1: AsyncIterableTransform<T, A>,
  fn2: AsyncIterableTransform<A, B>
): AsyncIterable<B>;
export function pipe<T, A, B, C>(
  iterable: AsyncIterable<T>,
  fn1: AsyncIterableTransform<T, A>,
  fn2: AsyncIterableTransform<A, B>,
  fn3: AsyncIterableTransform<B, C>
): AsyncIterable<C>;
export function pipe<T, A, B, C, D>(
  iterable: AsyncIterable<T>,
  fn1: AsyncIterableTransform<T, A>,
  fn2: AsyncIterableTransform<A, B>,
  fn3: AsyncIterableTransform<B, C>,
  fn4: AsyncIterableTransform<C, D>
): AsyncIterable<D>;
// Add more overloads as needed...

export function pipe<T>(
  iterable: AsyncIterable<T>,
  ...fns: Array<(iterable: AsyncIterable<any>) => AsyncIterable<any>>
): AsyncIterable<any> {
  return fns.reduce((acc, fn) => fn(acc), iterable);
}

// Helper functions for creating transforms
export const filterBy = <T>(predicate: (item: T, index: number) => boolean | Promise<boolean>) =>
  (iterable: AsyncIterable<T>) => filter(iterable, predicate);

export const mapTo = <T, U>(transform: (item: T, index: number) => U | Promise<U>) =>
  (iterable: AsyncIterable<T>) => map(iterable, transform);

export const takeFirst = <T>(count: number) =>
  (iterable: AsyncIterable<T>) => take(iterable, count);

export const skipFirst = <T>(count: number) =>
  (iterable: AsyncIterable<T>) => skip(iterable, count);

// Usage example:
/*
const result = await toArray(
  pipe(
    paginate(callback, options),
    filterBy(item => item.isActive),
    mapTo(item => item.name.toUpperCase()),
    takeFirst(10)
  )
);
*/

// Approach 4: Enhanced paginate function that returns a fluent wrapper
export function paginateFluent<T>(
  callback: PaginationCallback<T>,
  options: PaginationOptions
): AsyncIterableWrapper<T> {
  return new AsyncIterableWrapper(paginate(callback, options));
}

// Usage example:
/*
const result = await paginateFluent(callback, options)
  .filter(item => item.isActive)
  .map(item => item.name.toUpperCase())
  .take(10)
  .toArray();
*/

// Approach 5: Mixin approach - extends existing async iterables
declare global {
  interface AsyncIterable<T> {
    fluent(): AsyncIterableWrapper<T>;
  }
}

// This would require monkey-patching (not recommended in libraries)
// But shows how you could extend existing iterables
/*
AsyncIterable.prototype.fluent = function<T>(this: AsyncIterable<T>) {
  return new AsyncIterableWrapper(this);
};
*/

// Import the actual utility functions (these would be imported from your main file)
import type { PaginationCallback, PaginationOptions } from '../src/index';
import { 
  paginate, 
  filter, 
  map, 
  take, 
  skip, 
  toArray, 
  toSet, 
  toMap, 
  forEach, 
  reduce, 
  find, 
  some, 
  every 
} from '../src/index';