import { InputChoice } from './interfaces/input-choice';
import { RemoteOptions, RemoteDataResponse, RemoteState } from './interfaces/remote-options';

interface CachedPage {
  query: string;
  page: number;
  items: InputChoice[];
  timestamp: number;
}

/**
 * RemoteLoader handles remote data fetching, caching, and pagination
 * for the Choices library with infinite scroll support.
 */
export default class RemoteLoader {
  private options: RemoteOptions;

  private cache: Map<string, CachedPage> = new Map();

  private currentQuery: string = '';

  private currentPage: number;

  private totalPages: number = 1;

  private abortController: AbortController | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private isLoading: boolean = false;

  constructor(options: RemoteOptions) {
    this.options = options;
    this.currentPage = options.initialPage;
  }

  /**
   * Fetch data for a specific query and page with debouncing
   */
  fetch(query: string, page: number, immediate: boolean = false): Promise<RemoteDataResponse> {
    return new Promise((resolve, reject) => {
      // Clear existing debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      const doFetch = async (): Promise<void> => {
        // Check cache first
        const cacheKey = this.getCacheKey(query, page);
        const cached = this.cache.get(cacheKey);

        if (cached) {
          resolve({
            items: cached.items,
            page: cached.page,
            totalPages: this.totalPages,
          });

          return;
        }

        // Abort previous request if abortable
        if (this.options.abortable && this.abortController) {
          this.abortController.abort();
        }

        // Create new abort controller
        if (this.options.abortable) {
          this.abortController = new AbortController();
        }

        this.isLoading = true;

        try {
          const response = await this.performFetch(query, page);
          const mapped = await this.options.mapResponse(response);

          this.isLoading = false;

          // Update state
          this.currentQuery = query;
          this.currentPage = page;
          this.totalPages = mapped.totalPages;

          // Cache the result
          this.cacheResult(query, page, mapped.items);

          resolve(mapped);
        } catch (error) {
          this.isLoading = false;

          // Don't reject on abort errors
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }

          if (this.options.onError && error instanceof Error) {
            this.options.onError(error);
          }

          reject(error);
        }
      };

      // Apply debounce
      if (immediate || this.options.debounce === 0) {
        doFetch().catch(() => {
          // Errors are already handled in doFetch
        });
      } else {
        this.debounceTimer = setTimeout(() => {
          doFetch().catch(() => {
            // Errors are already handled in doFetch
          });
        }, this.options.debounce);
      }
    });
  }

  /**
   * Perform the actual fetch operation
   */
  private async performFetch(query: string, page: number): Promise<unknown> {
    const { url, pageSize } = this.options;

    if (typeof url === 'function') {
      const result = await url(query, page, pageSize);
      // If result is a Response object, parse as JSON
      if (result instanceof Response) {
        return result.json();
      }

      return result;
    }

    // URL is a string template - replace placeholders
    const fetchUrl = url
      .replace('{query}', encodeURIComponent(query))
      .replace('{page}', String(page))
      .replace('{pageSize}', String(pageSize));

    const fetchOptions: RequestInit = {};
    if (this.abortController) {
      fetchOptions.signal = this.abortController.signal;
    }

    const response = await fetch(fetchUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Cache a page result
   */
  private cacheResult(query: string, page: number, items: InputChoice[]): void {
    const cacheKey = this.getCacheKey(query, page);

    this.cache.set(cacheKey, {
      query,
      page,
      items,
      timestamp: Date.now(),
    });

    // Evict old entries if cache size exceeds limit
    if (this.cache.size > this.options.cachePages) {
      this.evictOldestCacheEntry();
    }
  }

  /**
   * Evict the oldest cache entry based on timestamp
   */
  private evictOldestCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    this.cache.forEach((value, key) => {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Generate cache key from query and page
   */
  // eslint-disable-next-line class-methods-use-this
  private getCacheKey(query: string, page: number): string {
    return `${query}||${page}`;
  }

  /**
   * Check if a page is cached
   */
  hasCachedPage(query: string, page: number): boolean {
    return this.cache.has(this.getCacheKey(query, page));
  }

  /**
   * Get current state
   */
  getState(): RemoteState {
    const cachedPages: number[] = [];
    this.cache.forEach((value) => {
      if (value.query === this.currentQuery) {
        cachedPages.push(value.page);
      }
    });

    return {
      query: this.currentQuery,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      cachedPages: cachedPages.sort((a, b) => a - b),
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if loader is currently loading
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Get the current query
   */
  getCurrentQuery(): string {
    return this.currentQuery;
  }

  /**
   * Get current page
   */
  getCurrentPage(): number {
    return this.currentPage;
  }

  /**
   * Get total pages
   */
  getTotalPages(): number {
    return this.totalPages;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.cache.clear();
  }
}
