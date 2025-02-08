import { describe, it, expect, vi, beforeEach } from "vitest";
import { paginate } from "../src/index";
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
