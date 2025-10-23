import { InputChoice } from './input-choice';
/**
 * Remote data fetch response shape
 */
export interface RemoteDataResponse {
    items: InputChoice[];
    page: number;
    totalPages: number;
}
/**
 * Remote data loader options
 */
export interface RemoteOptions {
    /**
     * URL template string (e.g., 'https://api.example.com/items?q={query}&page={page}&pageSize={pageSize}')
     * or a function that returns a Promise with Response or mapped data
     */
    url: string | ((query: string, page: number, pageSize: number) => Promise<Response | RemoteDataResponse>);
    /**
     * Number of items per page
     * @default 25
     */
    pageSize: number;
    /**
     * Initial page number (typically 1-indexed)
     * @default 1
     */
    initialPage: number;
    /**
     * Debounce delay in milliseconds for search queries
     * @default 300
     */
    debounce: number;
    /**
     * Maximum number of pages to cache in memory
     * @default 10
     */
    cachePages: number;
    /**
     * Whether to automatically load the initial page when dropdown opens
     * @default true
     */
    autoLoadInitial: boolean;
    /**
     * Function to map server response to expected format
     * @param response - The raw response from the server
     * @returns RemoteDataResponse with items, page, and totalPages
     */
    mapResponse: (response: unknown) => RemoteDataResponse | Promise<RemoteDataResponse>;
    /**
     * Whether requests should be abortable (cancels previous request when new one starts)
     * @default true
     */
    abortable: boolean;
    /**
     * IntersectionObserver threshold for sentinel elements
     * @default 0.01
     */
    threshold: number;
    /**
     * Error callback for network failures
     * @param error - The error that occurred
     */
    onError?: (error: Error) => void;
}
/**
 * State of the remote data loader
 */
export interface RemoteState {
    query: string;
    currentPage: number;
    totalPages: number;
    cachedPages: number[];
}
