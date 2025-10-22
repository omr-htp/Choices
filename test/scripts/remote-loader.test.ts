import { expect } from 'chai';
import { stub, spy, useFakeTimers, SinonFakeTimers } from 'sinon';
import { RemoteLoader, RemoteOptions, RemoteDataResponse } from '../../src';

describe('RemoteLoader', () => {
  let loader: RemoteLoader;
  let clock: SinonFakeTimers;
  let fetchStub: sinon.SinonStub;

  const defaultOptions: RemoteOptions = {
    url: 'https://api.example.com/items?q={query}&page={page}&pageSize={pageSize}',
    pageSize: 25,
    initialPage: 1,
    debounce: 300,
    cachePages: 10,
    autoLoadInitial: true,
    mapResponse: (response: unknown): RemoteDataResponse => response as RemoteDataResponse,
    abortable: true,
    threshold: 0.01,
  };

  beforeEach(() => {
    clock = useFakeTimers();
    fetchStub = stub(global, 'fetch');
  });

  afterEach(() => {
    if (loader) {
      loader.destroy();
    }
    clock.restore();
    fetchStub.restore();
  });

  describe('initialization', () => {
    it('creates a loader with the given options', () => {
      loader = new RemoteLoader(defaultOptions);
      expect(loader).to.be.instanceOf(RemoteLoader);
    });

    it('starts with empty cache', () => {
      loader = new RemoteLoader(defaultOptions);
      const state = loader.getState();
      expect(state.cachedPages).to.have.lengthOf(0);
    });

    it('initializes with the initial page', () => {
      loader = new RemoteLoader(defaultOptions);
      expect(loader.getCurrentPage()).to.equal(1);
    });
  });

  describe('debounce behavior', () => {
    it('debounces fetch calls', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      const promise = loader.fetch('test', 1, false);

      // Should not have called fetch yet
      expect(fetchStub.callCount).to.equal(0);

      // Advance clock by debounce time
      clock.tick(300);

      await promise;

      expect(fetchStub.callCount).to.equal(1);
    });

    it('cancels previous debounced call when new fetch starts', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      loader.fetch('test1', 1, false);
      clock.tick(100);

      const promise2 = loader.fetch('test2', 1, false);
      clock.tick(300);

      await promise2;

      // Should only have called fetch once (for the second query)
      expect(fetchStub.callCount).to.equal(1);
      const url = fetchStub.firstCall.args[0];
      expect(url).to.include('test2');
    });

    it('fetches immediately when immediate flag is true', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      const promise = loader.fetch('test', 1, true);

      // Should have called fetch immediately
      expect(fetchStub.callCount).to.equal(1);

      await promise;
    });

    it('fetches immediately when debounce is 0', async () => {
      const options = { ...defaultOptions, debounce: 0 };
      loader = new RemoteLoader(options);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      const promise = loader.fetch('test', 1, false);

      // Should have called fetch immediately even with immediate=false
      expect(fetchStub.callCount).to.equal(1);

      await promise;
    });
  });

  describe('AbortController behavior', () => {
    it('aborts previous request when new one starts', async () => {
      loader = new RemoteLoader(defaultOptions);
      const abortSpy = spy(AbortController.prototype, 'abort');

      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const promise1 = loader.fetch('test1', 1, true);
      const promise2 = loader.fetch('test2', 1, true);

      await promise2;

      expect(abortSpy.callCount).to.be.greaterThan(0);

      abortSpy.restore();
    });

    it('does not abort when abortable is false', async () => {
      const options = { ...defaultOptions, abortable: false };
      loader = new RemoteLoader(options);
      const abortSpy = spy(AbortController.prototype, 'abort');

      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('test1', 1, true);
      await loader.fetch('test2', 1, true);

      expect(abortSpy.callCount).to.equal(0);

      abortSpy.restore();
    });
  });

  describe('cache behavior', () => {
    it('returns cached result on second fetch', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('test', 1, true);
      await loader.fetch('test', 1, true);

      // Should only fetch once, second call uses cache
      expect(fetchStub.callCount).to.equal(1);
    });

    it('evicts oldest entry when cache exceeds limit', async () => {
      const options = { ...defaultOptions, cachePages: 3 };
      loader = new RemoteLoader(options);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      // Fill cache with 3 different query-page combinations
      await loader.fetch('query1', 1, true);
      await loader.fetch('query2', 1, true);
      await loader.fetch('query3', 1, true);

      // Cache should be full (3 entries)
      expect(loader.hasCachedPage('query1', 1)).to.be.true;
      expect(loader.hasCachedPage('query2', 1)).to.be.true;
      expect(loader.hasCachedPage('query3', 1)).to.be.true;

      // This should evict the oldest (query1)
      await loader.fetch('query4', 1, true);

      // First query should no longer be cached, but query4 should be
      expect(loader.hasCachedPage('query1', 1)).to.be.false;
      expect(loader.hasCachedPage('query4', 1)).to.be.true;
    });

    it('clears cache when clearCache is called', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('test', 1, true);
      expect(loader.hasCachedPage('test', 1)).to.be.true;

      loader.clearCache();
      expect(loader.hasCachedPage('test', 1)).to.be.false;
    });
  });

  describe('mapResponse', () => {
    it('applies mapResponse function to server response', async () => {
      const mapSpy = spy((response: unknown) => ({
        items: [(response as { data: { value: string; label: string } }).data],
        page: 1,
        totalPages: 1,
      }));

      const options = { ...defaultOptions, mapResponse: mapSpy };
      loader = new RemoteLoader(options);

      fetchStub.resolves({
        ok: true,
        json: async () => ({ data: { value: 'test', label: 'Test' } }),
      });

      await loader.fetch('test', 1, true);

      expect(mapSpy.callCount).to.equal(1);
      expect(mapSpy.firstCall.args[0]).to.deep.equal({ data: { value: 'test', label: 'Test' } });
    });

    it('supports async mapResponse function', async () => {
      const options = {
        ...defaultOptions,
        mapResponse: async (response: unknown) => ({
          items: [(response as { data: { value: string; label: string } }).data],
          page: 1,
          totalPages: 1,
        }),
      };
      loader = new RemoteLoader(options);

      fetchStub.resolves({
        ok: true,
        json: async () => ({ data: { value: 'test', label: 'Test' } }),
      });

      const result = await loader.fetch('test', 1, true);

      expect(result.items).to.have.lengthOf(1);
      expect(result.items[0].value).to.equal('test');
    });
  });

  describe('URL handling', () => {
    it('replaces placeholders in string URL', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('my query', 2, true);

      const url = fetchStub.firstCall.args[0];
      expect(url).to.include('q=my%20query');
      expect(url).to.include('page=2');
      expect(url).to.include('pageSize=25');
    });

    it('calls function URL with correct parameters', async () => {
      const urlFunc = spy(async (query: string, page: number, pageSize: number) => ({
        items: [{ value: query, label: `${page}-${pageSize}` }],
        page,
        totalPages: 1,
      }));

      const options = { ...defaultOptions, url: urlFunc };
      loader = new RemoteLoader(options);

      await loader.fetch('test', 3, true);

      expect(urlFunc.callCount).to.equal(1);
      expect(urlFunc.firstCall.args).to.deep.equal(['test', 3, 25]);
    });

    it('handles Response object from function URL', async () => {
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      const urlFunc = async () =>
        new Response(JSON.stringify(mockResponse), {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { 'Content-Type': 'application/json' },
        });

      const options = { ...defaultOptions, url: urlFunc };
      loader = new RemoteLoader(options);

      const result = await loader.fetch('test', 1, true);

      expect(result.items).to.have.lengthOf(1);
      expect(result.page).to.equal(1);
    });
  });

  describe('error handling', () => {
    it('calls onError callback on network failure', async () => {
      const errorSpy = spy();
      const options = { ...defaultOptions, onError: errorSpy };
      loader = new RemoteLoader(options);

      fetchStub.rejects(new Error('Network error'));

      try {
        await loader.fetch('test', 1, true);
      } catch (e) {
        // Expected to throw
      }

      expect(errorSpy.callCount).to.equal(1);
      expect(errorSpy.firstCall.args[0].message).to.equal('Network error');
    });

    it('handles HTTP error responses', async () => {
      loader = new RemoteLoader(defaultOptions);

      fetchStub.resolves({
        ok: false,
        status: 404,
      });

      try {
        await loader.fetch('test', 1, true);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).to.include('404');
      }
    });

    it('does not reject on AbortError', async () => {
      loader = new RemoteLoader(defaultOptions);

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      fetchStub.rejects(abortError);

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      loader.fetch('test', 1, true);
      // Should not throw
    });
  });

  describe('getState', () => {
    it('returns current state', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 2,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('my query', 2, true);

      const state = loader.getState();
      expect(state.query).to.equal('my query');
      expect(state.currentPage).to.equal(2);
      expect(state.totalPages).to.equal(5);
      expect(state.cachedPages).to.include(2);
    });

    it('returns cached pages for current query only', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('query1', 1, true);
      await loader.fetch('query1', 2, true);
      await loader.fetch('query2', 1, true);

      const state = loader.getState();
      expect(state.query).to.equal('query2');
      expect(state.cachedPages).to.deep.equal([1]);
    });
  });

  describe('destroy', () => {
    it('clears cache on destroy', async () => {
      loader = new RemoteLoader(defaultOptions);
      const mockResponse: RemoteDataResponse = {
        items: [{ value: 'test', label: 'Test' }],
        page: 1,
        totalPages: 5,
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await loader.fetch('test', 1, true);
      expect(loader.hasCachedPage('test', 1)).to.be.true;

      loader.destroy();

      expect(loader.hasCachedPage('test', 1)).to.be.false;
    });

    it('aborts ongoing request on destroy', async () => {
      loader = new RemoteLoader(defaultOptions);
      const abortSpy = spy(AbortController.prototype, 'abort');

      fetchStub.resolves(
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ items: [], page: 1, totalPages: 1 }),
            });
          }, 1000);
        }),
      );

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      loader.fetch('test', 1, true);
      loader.destroy();

      expect(abortSpy.callCount).to.be.greaterThan(0);

      abortSpy.restore();
    });
  });
});
