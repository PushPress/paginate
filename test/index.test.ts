import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  paginate, 
  FluentAsyncIterable,
  toArray, 
  toSet, 
  toMap, 
  forEach, 
  filter, 
  map, 
  take, 
  skip, 
  reduce, 
  find, 
  some, 
  every 
} from "../src/index";
import type { PaginationCallback } from "../src/index";

describe("paginate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should paginate through all items with offset strategy", async () => {
    const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);
    const callback = vi.fn(async ({ limit, offset = 0 }) => {
      const pageItems = items.slice(offset, offset + limit);
      return {
        items: pageItems,
        pageInfo: {
          hasNextPage: offset + limit < items.length,
        },
      };
    });

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,

      errorPolicy: { type: "throw" },
    });
    const result = [] as string[] as string[];

    for await (const item of pagination) {
      result.push(item);
    }

    expect(result).toEqual(items);
    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, { limit: 10, offset: 0 });
    expect(callback).toHaveBeenNthCalledWith(2, { limit: 10, offset: 10 });
    expect(callback).toHaveBeenNthCalledWith(3, { limit: 10, offset: 20 });
  });

  it("should handle initialOffset correctly", async () => {
    const callback = vi.fn(async ({ offset = 0 }) => ({
      items: [`item-${offset}`],
      pageInfo: {
        hasNextPage: false,
      },
    }));

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,

      initialOffset: 5,
      errorPolicy: { type: "break" },
    });

    const result = [] as string[] as string[];
    for await (const item of pagination) {
      result.push(item);
    }

    expect(callback).toHaveBeenCalledWith({ limit: 10, offset: 5 });
    expect(result).toEqual(["item-5"]);
  });

  it("should handle empty pages", async () => {
    const callback = vi.fn(async () => ({
      items: [],
      pageInfo: {
        hasNextPage: false,
      },
    }));

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,

      errorPolicy: { type: "continue", maxErrorCount: 2 },
    });
    const result = [] as string[];

    for await (const item of pagination) {
      result.push(item);
    }

    expect(result).toEqual([]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should paginate through all items with cursor strategy", async () => {
    const cursors = ["cursor1", "cursor2", null];
    const pageItems = [["item1", "item2"], ["item3", "item4"], ["item5"]];
    let callCount = 0;

    const callback = vi.fn(async ({ limit, cursor }) => {
      const currentPage = callCount++;
      return {
        items: pageItems[currentPage],
        pageInfo: {
          hasNextPage: currentPage < pageItems.length - 1,
          nextCursor: cursors[currentPage],
        },
      };
    });

    const pagination = paginate(callback, {
      strategy: "cursor",

      limit: 2,
      errorPolicy: { type: "continue", maxErrorCount: 2 },
    });
    const result = [] as string[];

    for await (const item of pagination) {
      result.push(item);
    }

    expect(result).toEqual(["item1", "item2", "item3", "item4", "item5"]);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("should handle initialCursor correctly", async () => {
    const callback = vi.fn(async ({ cursor }) => ({
      items: [`item-${cursor}`],
      pageInfo: {
        hasNextPage: false,
        nextCursor: null,
      },
    }));

    const pagination = paginate(callback, {
      strategy: "cursor",
      limit: 10,
      initialCursor: "start",

      errorPolicy: { type: "continue", maxErrorCount: 2 },
    });

    const result = [] as string[];

    for await (const item of pagination) {
      result.push(item);
    }

    expect(callback).toHaveBeenCalledWith({ limit: 10, cursor: "start" });
    expect(result).toEqual(["item-start"]);
  });

  const createErrorCallback = (
    shouldError = true,
  ): PaginationCallback<string> => {
    return vi.fn(async () => {
      if (shouldError) {
        throw new Error("Test error");
      }
      return {
        items: ["success"],
        pageInfo: { hasNextPage: false },
      };
    });
  };

  it("should call onError callback when error occurs", async () => {
    const onError = vi.fn();
    const callback = createErrorCallback();

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,
      hooks: { onError },
      errorPolicy: { type: "continue", maxErrorCount: 2 },
    });

    const result = [] as string[];
    for await (const item of pagination) {
      result.push(item);
    }

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(result).toEqual([]);
  });

  it('should throw error when errorPolicy is "throw"', async () => {
    const callback = createErrorCallback();
    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,

      errorPolicy: { type: "throw" },
    });

    await expect(async () => {
      for await (const item of pagination) {
        console.log(item);
      }
    }).rejects.toThrow("Test error");
  });

  it('should break pagination when errorPolicy is "break"', async () => {
    const onError = vi.fn();
    const callback = vi.fn(async ({ offset = 0 }) => {
      if (offset === 10) {
        throw new Error("Test error");
      }
      return {
        items: ["item"],
        pageInfo: { hasNextPage: true },
      };
    });

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,
      hooks: { onError },
      errorPolicy: { type: "break" },
    });

    const result = [] as string[];
    for await (const item of pagination) {
      result.push(item);
    }

    expect(result).toEqual(["item"]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should continue pagination when errorPolicy is "continue"', async () => {
    let callCount = 0;
    const callback = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Test error");
      }
      return {
        items: [`item-${callCount}`],
        pageInfo: { hasNextPage: callCount < 3 },
      };
    });

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,

      errorPolicy: { type: "continue", maxErrorCount: 2 },
    });

    const result = [] as string[];
    for await (const item of pagination) {
      result.push(item);
    }

    expect(result).toEqual(["item-1", "item-3"]);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("should handle callbacks that return undefined nextCursor", async () => {
    const callback = vi.fn(async () => ({
      items: ["item"],
      pageInfo: {
        hasNextPage: false,
        nextCursor: undefined,
      },
    }));

    const pagination = paginate(callback, {
      strategy: "cursor",
      limit: 10,
      errorPolicy: { type: "continue", maxErrorCount: 2 },
    });
    const result = [] as string[];

    for await (const item of pagination) {
      result.push(item);
    }

    expect(result).toEqual(["item"]);
  });

  it("should handle errors in onError callback gracefully", async () => {
    const onError = vi.fn().mockRejectedValue(new Error("onError failed"));
    const callback = createErrorCallback();

    const pagination = paginate(callback, {
      strategy: "offset",
      limit: 10,
      errorPolicy: { type: "continue", maxErrorCount: 2 },
      hooks: {
        onError,
      },
    });

    const result = [] as string[];
    for await (const item of pagination) {
      result.push(item);
    }

    expect(onError).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  describe("custom error handling", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    describe("continue action", () => {
      it("should continue pagination after error with offset strategy", async () => {
        let callCount = 0;
        const callback = vi.fn(async ({ offset = 0 }) => {
          callCount++;
          if (callCount === 2) {
            throw new Error("Temporary error");
          }
          return {
            items: [`item-${offset}`],
            pageInfo: { hasNextPage: callCount < 3 },
          };
        });

        const iterator = paginate(callback, {
          strategy: "offset",
          limit: 10,

          errorPolicy: {
            type: "custom",
            handler: () => true, // continue
          },
        });

        const result = [] as string[];
        for await (const item of iterator) {
          result.push(item);
        }

        expect(result).toEqual(["item-0", "item-20"]);
        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenNthCalledWith(1, { limit: 10, offset: 0 });
        expect(callback).toHaveBeenNthCalledWith(2, { limit: 10, offset: 10 });
        expect(callback).toHaveBeenNthCalledWith(3, { limit: 10, offset: 20 });
      });

      it("should handle cursor strategy with continue action", async () => {
        let callCount = 0;
        const callback = vi.fn(async ({ cursor }) => {
          callCount++;
          if (callCount === 2) {
            throw new Error("Temporary error");
          }
          return {
            items: [`item-${callCount}`],
            pageInfo: {
              hasNextPage: callCount < 3,
              nextCursor: callCount < 3 ? `cursor-${callCount}` : undefined,
            },
          };
        });

        const iterator = paginate(callback, {
          strategy: "cursor",
          limit: 10,

          errorPolicy: {
            type: "custom",
            handler: () => true,
          },
        });

        const result = [] as string[];
        for await (const item of iterator) {
          result.push(item);
        }

        // We get item-1, error on item-2, then get item-3 using cursor-1
        expect(result).toEqual(["item-1", "item-3"]);
        expect(callback).toHaveBeenCalledTimes(3);

        // Verify the cursor progression
        expect(callback).toHaveBeenNthCalledWith(1, {
          limit: 10,
          cursor: undefined,
        });
        expect(callback).toHaveBeenNthCalledWith(2, {
          limit: 10,
          cursor: "cursor-1",
        });
        expect(callback).toHaveBeenNthCalledWith(3, {
          limit: 10,
          cursor: "cursor-1",
        }); // Uses last valid cursor
      });

      describe("break action", () => {
        it("should stop pagination immediately when handler returns false", async () => {
          let callCount = 0;
          const callback = vi.fn(async () => {
            callCount++;
            if (callCount === 2) {
              throw new Error("Break error");
            }
            return {
              items: [`item-${callCount}`],
              pageInfo: { hasNextPage: true },
            };
          });

          const iterator = paginate(callback, {
            strategy: "offset",
            limit: 10,

            errorPolicy: {
              type: "custom",
              handler: () => false, // break
            },
          });

          const result = [] as string[];
          for await (const item of iterator) {
            result.push(item);
          }

          expect(result).toEqual(["item-1"]);
          expect(callback).toHaveBeenCalledTimes(2);
        });

        it("should handle async break decision", async () => {
          const callback = vi.fn(async () => {
            throw new Error("Test error");
          });

          const iterator = paginate(callback, {
            strategy: "offset",
            limit: 10,

            errorPolicy: {
              type: "custom",
              handler: async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return false; // break
              },
            },
          });

          const result = [] as unknown[];
          for await (const item of iterator) {
            result.push(item);
          }

          expect(result).toEqual([]);
          expect(callback).toHaveBeenCalledTimes(1);
        });
      });

      describe("conditional error handling", () => {
        it("should handle decisions based on error count", async () => {
          let callCount = 0;
          const callback = vi.fn(async () => {
            callCount++;
            throw new Error(`Error ${callCount}`);
          });

          const decisions: boolean[] = [];
          const iterator = paginate(callback, {
            strategy: "offset",
            limit: 10,

            errorPolicy: {
              type: "custom",
              handler: (_, { consecutiveErrors }) => {
                const decision = consecutiveErrors <= 2;
                decisions.push(decision);
                return decision;
              },
            },
          });

          const result = [] as unknown[];
          for await (const item of iterator) {
            result.push(item);
          }

          expect(decisions).toEqual([true, true, false]);
          expect(callback).toHaveBeenCalledTimes(3);
        });

        it("should make decisions based on error type", async () => {
          const errors = [
            new Error("Retryable error"),
            new Error("Retryable error again"),
            new Error("Fatal error"),
          ];
          let errorIndex = 0;

          const callback = vi.fn(async () => {
            if (errorIndex < errors.length) {
              throw errors[errorIndex++];
            }
            return {
              items: ["success"],
              pageInfo: { hasNextPage: false },
            };
          });

          const decisions: boolean[] = [];
          const iterator = paginate(callback, {
            strategy: "offset",
            limit: 10,
            errorPolicy: {
              type: "custom",
              handler: (error) => {
                const decision =
                  error instanceof Error && !error.message.includes("Fatal");
                decisions.push(decision);
                return decision;
              },
            },
          });

          const result = [] as unknown[];
          for await (const item of iterator) {
            result.push(item);
          }

          expect(decisions).toEqual([true, true, false]);
          expect(result).toEqual([]);
          expect(callback).toHaveBeenCalledTimes(3);
        });

        it("should respect immediate termination on false return", async () => {
          const callback = vi.fn(async () => {
            throw new Error("Any error");
          });

          let handlerCalls = 0;
          const iterator = paginate(callback, {
            strategy: "offset",
            limit: 10,
            errorPolicy: {
              type: "custom",
              handler: () => {
                handlerCalls++;
                return false;
              },
            },
          });

          const result = [] as unknown[];
          for await (const item of iterator) {
            result.push(item);
          }

          expect(handlerCalls).toBe(1);
          expect(callback).toHaveBeenCalledTimes(1);
        });
      });
    });
  });
  describe("lifecycle hooks", () => {
    it("should call onPage hook on each page with the cursor", async () => {
      const onPage = vi.fn();
      const cursors = ["cursor1", "cursor2", null];
      const pageItems = [["item1", "item2"], ["item3", "item4"], ["item5"]];
      let callCount = 0;

      const callback = vi.fn(async ({ limit, cursor }) => {
        const currentPage = callCount++;
        return {
          items: pageItems[currentPage],
          pageInfo: {
            hasNextPage: currentPage < pageItems.length - 1,
            nextCursor: cursors[currentPage],
          },
        };
      });

      const pagination = paginate(callback, {
        strategy: "cursor",
        limit: 2,
        hooks: { onPage },
        errorPolicy: { type: "continue", maxErrorCount: 2 },
      });

      const result = [] as string[];
      for await (const item of pagination) {
        result.push(item);
      }

      expect(onPage).toHaveBeenCalledTimes(3);
      expect(onPage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ cursor: undefined }),
      );
      expect(onPage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: "cursor1" }),
      );
      expect(onPage).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ cursor: "cursor2" }),
      );
    });
    it("should call the onPage hook on each page with the offset", async () => {
      const onPage = vi.fn();
      const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);
      const callback = vi.fn(async ({ limit, offset = 0 }) => {
        const pageItems = items.slice(offset, offset + limit);
        return {
          items: pageItems,
          pageInfo: {
            hasNextPage: offset + limit < items.length,
          },
        };
      });

      const pagination = paginate(callback, {
        strategy: "offset",
        limit: 10,
        hooks: { onPage },
        errorPolicy: { type: "throw" },
      });

      const result = [] as string[];
      for await (const item of pagination) {
        result.push(item);
      }

      expect(onPage).toHaveBeenCalledTimes(3);
      expect(onPage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ offset: 0 }),
      );
      expect(onPage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ offset: 10 }),
      );
      expect(onPage).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ offset: 20 }),
      );
    });
    it("should call the onReturn hook once once on return", async () => {
      const onReturn = vi.fn();
      const items = Array.from({ length: 5 }, (_, i) => `item-${i}`);
      const callback = vi.fn(async ({ limit, offset = 0 }) => {
        const pageItems = items.slice(offset, offset + limit);
        return {
          items: pageItems,
          pageInfo: {
            hasNextPage: offset + limit < items.length,
          },
        };
      });

      const pagination = paginate(callback, {
        strategy: "offset",
        limit: 5,
        hooks: { onReturn },
        errorPolicy: { type: "throw" },
      });

      const result = [] as string[];
      for await (const item of pagination) {
        result.push(item);
      }

      expect(onReturn).toHaveBeenCalledTimes(1);
    });
    it("should call the onError hook on error", async () => {
      const onError = vi.fn();
      const callback = vi.fn(async () => {
        throw new Error("Test error");
      });

      const pagination = paginate(callback, {
        strategy: "offset",
        limit: 10,
        hooks: { onError },
        errorPolicy: { type: "continue", maxErrorCount: 2 },
      });

      const result = [] as unknown[];
      for await (const item of pagination) {
        result.push(item);
      }

      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
    it("should call the onMaxErrorCount hook on max error count", async () => {
      const onMaxConsecutiveErrors = vi.fn();
      const callback = vi.fn(async () => {
        throw new Error("Test error");
      });

      const pagination = paginate(callback, {
        strategy: "offset",
        limit: 10,
        hooks: { onMaxConsecutiveErrors },
        errorPolicy: { type: "continue", maxErrorCount: 2 },
      });

      const result = [] as unknown[];
      for await (const item of pagination) {
        result.push(item);
      }

      expect(onMaxConsecutiveErrors).toHaveBeenCalledTimes(1);
    });
  });
});

describe("utility functions", () => {
  const createSimpleIterator = (items: string[]) => {
    return paginate(
      async ({ limit, offset = 0 }) => {
        const pageItems = items.slice(offset, offset + limit);
        return {
          items: pageItems,
          pageInfo: {
            hasNextPage: offset + limit < items.length,
          },
        };
      },
      {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      },
    );
  };

  describe("toArray", () => {
    it("should collect all items into an array", async () => {
      const items = ["a", "b", "c", "d", "e"];
      const iterator = createSimpleIterator(items);
      
      const result = await toArray(iterator);
      
      expect(result).toEqual(items);
    });

    it("should handle empty iterables", async () => {
      const iterator = createSimpleIterator([]);
      
      const result = await toArray(iterator);
      
      expect(result).toEqual([]);
    });
  });

  describe("toSet", () => {
    it("should collect unique items into a Set", async () => {
      const items = ["a", "b", "a", "c", "b", "d"];
      const iterator = createSimpleIterator(items);
      
      const result = await toSet(iterator);
      
      expect(result).toEqual(new Set(["a", "b", "c", "d"]));
      expect(result.size).toBe(4);
    });

    it("should handle empty iterables", async () => {
      const iterator = createSimpleIterator([]);
      
      const result = await toSet(iterator);
      
      expect(result.size).toBe(0);
    });
  });

  describe("toMap", () => {
    it("should collect items into a Map using key function", async () => {
      const users = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
        { id: "3", name: "Charlie" }
      ];
      
      const iterator = paginate(
        async ({ limit, offset = 0 }) => {
          const pageItems = users.slice(offset, offset + limit);
          return {
            items: pageItems,
            pageInfo: {
              hasNextPage: offset + limit < users.length,
            },
          };
        },
        {
          strategy: "offset",
          limit: 2,
          errorPolicy: { type: "throw" },
        },
      );
      
      const result = await toMap(iterator, user => user.id);
      
      expect(result.get("1")).toEqual({ id: "1", name: "Alice" });
      expect(result.get("2")).toEqual({ id: "2", name: "Bob" });
      expect(result.get("3")).toEqual({ id: "3", name: "Charlie" });
      expect(result.size).toBe(3);
    });

    it("should handle duplicate keys by keeping last value", async () => {
      const items = [
        { id: "1", value: "first" },
        { id: "1", value: "second" }
      ];
      
      const iterator = paginate(
        async ({ limit, offset = 0 }) => {
          const pageItems = items.slice(offset, offset + limit);
          return {
            items: pageItems,
            pageInfo: {
              hasNextPage: offset + limit < items.length,
            },
          };
        },
        {
          strategy: "offset",
          limit: 1,
          errorPolicy: { type: "throw" },
        },
      );
      
      const result = await toMap(iterator, item => item.id);
      
      expect(result.get("1")).toEqual({ id: "1", value: "second" });
      expect(result.size).toBe(1);
    });
  });

  describe("forEach", () => {
    it("should execute function for each item", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      const results: string[] = [];
      const indices: number[] = [];
      
      await forEach(iterator, (item, index) => {
        results.push(item);
        indices.push(index);
      });
      
      expect(results).toEqual(items);
      expect(indices).toEqual([0, 1, 2]);
    });

    it("should handle async functions", async () => {
      const items = ["a", "b"];
      const iterator = createSimpleIterator(items);
      const results: string[] = [];
      
      await forEach(iterator, async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        results.push(item.toUpperCase());
      });
      
      expect(results).toEqual(["A", "B"]);
    });
  });

  describe("filter", () => {
    it("should filter items based on predicate", async () => {
      const items = ["apple", "banana", "cherry", "date"];
      const iterator = createSimpleIterator(items);
      
      const filtered = filter(iterator, item => item.length > 5);
      const result = await toArray(filtered);
      
      expect(result).toEqual(["banana", "cherry"]);
    });

    it("should provide index to predicate", async () => {
      const items = ["a", "b", "c", "d"];
      const iterator = createSimpleIterator(items);
      
      const filtered = filter(iterator, (item, index) => index % 2 === 0);
      const result = await toArray(filtered);
      
      expect(result).toEqual(["a", "c"]);
    });

    it("should handle async predicates", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const filtered = filter(iterator, async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return item !== "b";
      });
      const result = await toArray(filtered);
      
      expect(result).toEqual(["a", "c"]);
    });
  });

  describe("map", () => {
    it("should transform items", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const mapped = map(iterator, item => item.toUpperCase());
      const result = await toArray(mapped);
      
      expect(result).toEqual(["A", "B", "C"]);
    });

    it("should provide index to transform function", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const mapped = map(iterator, (item, index) => `${index}:${item}`);
      const result = await toArray(mapped);
      
      expect(result).toEqual(["0:a", "1:b", "2:c"]);
    });

    it("should handle async transform functions", async () => {
      const items = ["a", "b"];
      const iterator = createSimpleIterator(items);
      
      const mapped = map(iterator, async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return item.repeat(2);
      });
      const result = await toArray(mapped);
      
      expect(result).toEqual(["aa", "bb"]);
    });
  });

  describe("take", () => {
    it("should take first n items", async () => {
      const items = ["a", "b", "c", "d", "e"];
      const iterator = createSimpleIterator(items);
      
      const taken = take(iterator, 3);
      const result = await toArray(taken);
      
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should handle taking more items than available", async () => {
      const items = ["a", "b"];
      const iterator = createSimpleIterator(items);
      
      const taken = take(iterator, 5);
      const result = await toArray(taken);
      
      expect(result).toEqual(["a", "b"]);
    });

    it("should handle zero or negative count", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const taken = take(iterator, 0);
      const result = await toArray(taken);
      
      expect(result).toEqual([]);
    });
  });

  describe("skip", () => {
    it("should skip first n items", async () => {
      const items = ["a", "b", "c", "d", "e"];
      const iterator = createSimpleIterator(items);
      
      const skipped = skip(iterator, 2);
      const result = await toArray(skipped);
      
      expect(result).toEqual(["c", "d", "e"]);
    });

    it("should handle skipping more items than available", async () => {
      const items = ["a", "b"];
      const iterator = createSimpleIterator(items);
      
      const skipped = skip(iterator, 5);
      const result = await toArray(skipped);
      
      expect(result).toEqual([]);
    });

    it("should handle zero skip count", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const skipped = skip(iterator, 0);
      const result = await toArray(skipped);
      
      expect(result).toEqual(items);
    });
  });

  describe("reduce", () => {
    it("should reduce items to single value", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await reduce(iterator, (acc, item) => acc + item, "");
      
      expect(result).toBe("abc");
    });

    it("should provide index to reducer", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await reduce(
        iterator, 
        (acc, item, index) => `${acc}${index}:${item}|`, 
        ""
      );
      
      expect(result).toBe("0:a|1:b|2:c|");
    });

    it("should handle async reducers", async () => {
      const items = [1, 2, 3];
      const iterator = paginate(
        async ({ limit, offset = 0 }) => {
          const pageItems = items.slice(offset, offset + limit);
          return {
            items: pageItems,
            pageInfo: {
              hasNextPage: offset + limit < items.length,
            },
          };
        },
        {
          strategy: "offset",
          limit: 2,
          errorPolicy: { type: "throw" },
        },
      );
      
      const result = await reduce(iterator, async (acc, item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return acc + item;
      }, 0);
      
      expect(result).toBe(6);
    });
  });

  describe("find", () => {
    it("should find first matching item", async () => {
      const items = ["apple", "banana", "cherry"];
      const iterator = createSimpleIterator(items);
      
      const result = await find(iterator, item => item.startsWith("b"));
      
      expect(result).toBe("banana");
    });

    it("should return undefined if no match found", async () => {
      const items = ["apple", "banana", "cherry"];
      const iterator = createSimpleIterator(items);
      
      const result = await find(iterator, item => item.startsWith("z"));
      
      expect(result).toBeUndefined();
    });

    it("should provide index to predicate", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await find(iterator, (item, index) => index === 1);
      
      expect(result).toBe("b");
    });

    it("should handle async predicates", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await find(iterator, async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return item === "c";
      });
      
      expect(result).toBe("c");
    });
  });

  describe("some", () => {
    it("should return true if any item matches", async () => {
      const items = ["apple", "banana", "cherry"];
      const iterator = createSimpleIterator(items);
      
      const result = await some(iterator, item => item.length >= 6);
      
      expect(result).toBe(true);
    });

    it("should return false if no items match", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await some(iterator, item => item.length > 5);
      
      expect(result).toBe(false);
    });

    it("should handle async predicates", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await some(iterator, async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return item === "b";
      });
      
      expect(result).toBe(true);
    });
  });

  describe("every", () => {
    it("should return true if all items match", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await every(iterator, item => item.length === 1);
      
      expect(result).toBe(true);
    });

    it("should return false if any item doesn't match", async () => {
      const items = ["a", "bb", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await every(iterator, item => item.length === 1);
      
      expect(result).toBe(false);
    });

    it("should handle async predicates", async () => {
      const items = ["a", "b", "c"];
      const iterator = createSimpleIterator(items);
      
      const result = await every(iterator, async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return typeof item === "string";
      });
      
      expect(result).toBe(true);
    });

    it("should return true for empty iterables", async () => {
      const iterator = createSimpleIterator([]);
      
      const result = await every(iterator, () => false);
      
      expect(result).toBe(true);
    });
  });

  describe("utility composition", () => {
    it("should allow chaining utilities", async () => {
      const items = ["apple", "banana", "cherry", "date", "elderberry"];
      const iterator = createSimpleIterator(items);
      
      // Filter items longer than 5 chars, take first 2, and convert to uppercase
      const result = await toArray(
        take(
          map(
            filter(iterator, item => item.length > 5),
            item => item.toUpperCase()
          ),
          2
        )
      );
      
      expect(result).toEqual(["BANANA", "CHERRY"]);
    });

    it("should work with reduce after filtering", async () => {
      const items = [1, 2, 3, 4, 5, 6];
      const iterator = paginate(
        async ({ limit, offset = 0 }) => {
          const pageItems = items.slice(offset, offset + limit);
          return {
            items: pageItems,
            pageInfo: {
              hasNextPage: offset + limit < items.length,
            },
          };
        },
        {
          strategy: "offset",
          limit: 3,
          errorPolicy: { type: "throw" },
        },
      );
      
      // Sum only even numbers
      const result = await reduce(
        filter(iterator, n => n % 2 === 0),
        (sum, n) => sum + n,
        0
      );
      
      expect(result).toBe(12); // 2 + 4 + 6
    });
  });
});

describe("fluent interface", () => {
  const createTestCallback = (items: string[]) => {
    return async ({ limit, offset = 0 }: { limit: number; offset?: number }) => {
      const pageItems = items.slice(offset, offset + limit);
      return {
        items: pageItems,
        pageInfo: {
          hasNextPage: offset + limit < items.length,
        },
      };
    };
  };

  describe("FluentAsyncIterable", () => {
    it("should implement AsyncIterable interface", async () => {
      const items = ["a", "b", "c"];
      const pagination = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      expect(pagination).toBeInstanceOf(FluentAsyncIterable);
      expect(typeof pagination[Symbol.asyncIterator]).toBe("function");

      // Should work with for-await loops
      const result: string[] = [];
      for await (const item of pagination) {
        result.push(item);
      }
      expect(result).toEqual(items);
    });

    it("should support fluent method chaining", async () => {
      const items = ["apple", "banana", "cherry", "date", "elderberry"];
      const pagination = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      const result = await pagination
        .filter(item => item.length > 4)
        .map(item => item.toUpperCase())
        .take(2)
        .toArray();

      expect(result).toEqual(["APPLE", "BANANA"]);
    });

    it("should support mixed usage with for-await loops", async () => {
      const items = ["apple", "banana", "cherry", "date"];
      const pagination = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      const filtered = pagination.filter(item => item.length > 4);
      
      const result: string[] = [];
      for await (const item of filtered) {
        result.push(item.toUpperCase());
      }

      expect(result).toEqual(["APPLE", "BANANA", "CHERRY"]);
    });

    it("should maintain type safety through transformations", async () => {
      interface User {
        id: number;
        name: string;
        isActive: boolean;
      }

      const users: User[] = [
        { id: 1, name: "Alice", isActive: true },
        { id: 2, name: "Bob", isActive: false },
        { id: 3, name: "Charlie", isActive: true },
      ];

      const userCallback = async ({ limit, offset = 0 }: { limit: number; offset?: number }) => {
        const pageItems = users.slice(offset, offset + limit);
        return {
          items: pageItems,
          pageInfo: { hasNextPage: offset + limit < users.length },
        };
      };

      const result = await paginate(userCallback, {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      })
        .filter(user => user.isActive)
        .map(user => user.name.toUpperCase())
        .toArray();

      expect(result).toEqual(["ALICE", "CHARLIE"]);
    });

    it("should work with all terminal operations", async () => {
      const items = ["a", "b", "c", "b", "d"];
      const pagination = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      });

      // Test different terminal operations
      const array = await pagination.toArray();
      expect(array).toEqual(items);

      const set = await paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      }).toSet();
      expect(set).toEqual(new Set(["a", "b", "c", "d"]));

      const map = await paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      }).toMap(item => item);
      expect(map.get("a")).toBe("a");
      expect(map.size).toBe(4);

      const found = await paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      }).find(item => item === "c");
      expect(found).toBe("c");

      const hasB = await paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      }).some(item => item === "b");
      expect(hasB).toBe(true);

      const allStrings = await paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      }).every(item => typeof item === "string");
      expect(allStrings).toBe(true);
    });

    it("should support async predicates and transforms", async () => {
      const items = ["a", "b", "c"];
      const pagination = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      const result = await pagination
        .filter(async (item) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return item !== "b";
        })
        .map(async (item) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return item.toUpperCase();
        })
        .toArray();

      expect(result).toEqual(["A", "C"]);
    });

    it("should work with complex chaining scenarios", async () => {
      const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const callback = async ({ limit, offset = 0 }: { limit: number; offset?: number }) => {
        const pageItems = numbers.slice(offset, offset + limit);
        return {
          items: pageItems,
          pageInfo: { hasNextPage: offset + limit < numbers.length },
        };
      };

      // Complex pipeline: filter evens, multiply by 2, skip first 2, take 3, sum
      const result = await paginate(callback, {
        strategy: "offset",
        limit: 3,
        errorPolicy: { type: "throw" },
      })
        .filter(n => n % 2 === 0)  // [2, 4, 6, 8, 10]
        .map(n => n * 2)           // [4, 8, 12, 16, 20]
        .skip(2)                   // [12, 16, 20]
        .take(2)                   // [12, 16]
        .reduce((sum, n) => sum + n, 0);

      expect(result).toBe(28); // 12 + 16
    });
  });

  describe("backward compatibility", () => {
    it("should maintain compatibility with existing for-await usage", async () => {
      const items = ["a", "b", "c"];
      const pagination = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      // This should work exactly as before
      const result: string[] = [];
      for await (const item of pagination) {
        result.push(item);
      }

      expect(result).toEqual(items);
    });

    it("should work with existing utility functions", async () => {
      const items = ["a", "b", "c"];
      
      // Test with fresh pagination instance each time since iterators are consumed
      const pagination1 = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      // Should still work with standalone utility functions
      const result = await toArray(pagination1);
      expect(result).toEqual(items);

      const pagination2 = paginate(createTestCallback(items), {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      const filtered = filter(pagination2, item => item !== "b");
      const filteredResult = await toArray(filtered);
      expect(filteredResult).toEqual(["a", "c"]);
    });

    it("should maintain all existing pagination functionality", async () => {
      // Test that all the original pagination features still work
      const items = ["a", "b", "c", "d", "e"];
      let callCount = 0;
      
      const callback = vi.fn(async ({ limit, offset = 0 }) => {
        callCount++;
        const pageItems = items.slice(offset, offset + limit);
        return {
          items: pageItems,
          pageInfo: {
            hasNextPage: offset + limit < items.length,
          },
        };
      });

      const pagination = paginate(callback, {
        strategy: "offset",
        limit: 2,
        errorPolicy: { type: "throw" },
      });

      const result = await pagination.toArray();
      
      expect(result).toEqual(items);
      expect(callback).toHaveBeenCalledTimes(3); // 3 pages needed
      expect(callback).toHaveBeenNthCalledWith(1, { limit: 2, offset: 0 });
      expect(callback).toHaveBeenNthCalledWith(2, { limit: 2, offset: 2 });
      expect(callback).toHaveBeenNthCalledWith(3, { limit: 2, offset: 4 });
    });
  });
});
