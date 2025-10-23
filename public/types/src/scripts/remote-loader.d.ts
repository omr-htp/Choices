import { RemoteOptions, RemoteDataResponse, RemoteState } from './interfaces/remote-options';
/**
 * RemoteLoader handles remote data fetching, caching, and pagination
 * for the Choices library with infinite scroll support.
 */
export default class RemoteLoader {
    private options;
    private cache;
    private currentQuery;
    private currentPage;
    private totalPages;
    private abortController;
    private debounceTimer;
    private isLoading;
    constructor(options: RemoteOptions);
    /**
     * Fetch data for a specific query and page with debouncing
     */
    fetch(query: string, page: number, immediate?: boolean): Promise<RemoteDataResponse>;
    /**
     * Perform the actual fetch operation
     */
    private performFetch;
    /**
     * Cache a page result
     */
    private cacheResult;
    /**
     * Evict the oldest cache entry based on timestamp
     */
    private evictOldestCacheEntry;
    /**
     * Generate cache key from query and page
     */
    private getCacheKey;
    /**
     * Check if a page is cached
     */
    hasCachedPage(query: string, page: number): boolean;
    /**
     * Get current state
     */
    getState(): RemoteState;
    /**
     * Clear all cached data
     */
    clearCache(): void;
    /**
     * Check if loader is currently loading
     */
    getIsLoading(): boolean;
    /**
     * Get the current query
     */
    getCurrentQuery(): string;
    /**
     * Get current page
     */
    getCurrentPage(): number;
    /**
     * Get total pages
     */
    getTotalPages(): number;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
