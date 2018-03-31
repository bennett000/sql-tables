import { expect } from 'chai';
import {
  Client,
} from 'pg';
import { Dictionary } from './util';
import {
  createInsertQuery,
  createPgQuery,
  createQueryObservable,
  createQueryStream,
  createReduceCompoundInsertOrSelectResults,
  getClientFrom,
  hasQueryError,
  isValidResult,
  reduceByKeys,
  validatePropValsForInput,
} from './table';

describe('table specs', () => {
  describe('createInsertQuery function', () => {
    it('should handle single values', () => {
      expect(createInsertQuery('users', ['name'], ['jane'])).to
        .equal('INSERT INTO users (name) VALUES ($1)');
    });

    it('should handle multiple values', () => {
      expect(createInsertQuery('users', ['name', 'rank'], ['jane', 'major'])).to
        .equal('INSERT INTO users (name, rank) VALUES ($1, $2)');
    });
  });

  describe('createPgQuery function', () => {
    it('should call the query with params if given params', (done) => {
      const params = ['hello', 'world'];
      const qf = (q: string, p: any[]) => {
        expect(p).to.deep.equal(params);
        done();
      };
      expect(createPgQuery(<Client>{ query: qf }, 'hello', params));
    });

    it('should call the query without params if not given params', (done) => {
      const qf = (q: string, p: any[]) => {
        expect(p).to.equal(undefined);
        done();
      };
      expect(createPgQuery(<Client>{ query: qf }, 'hello'));
    });
  });

  describe('createQueryStream function', () => {
    let client: Client;
    let callbacks: Dictionary<Function[]> = {};
    const emit = (
      event: string, value: any
    ) => callbacks[event].forEach(cb => cb(value));

    beforeEach(() => {
      callbacks = {};
      client = <Client>(<any>{
        query: () => ({
          on: (event: string, handler: Function) => {
            if (!callbacks[event]) {
              callbacks[event] = [];
            }
            callbacks[event].push(handler);
          },
        }),
      });
    });

    it('should return a rejecting observable if an error event is raised',
      (done) => {
        createQueryStream(client, 'hello', [])
          .subscribe(
            () => expect('this case').to.equal(undefined),
            (err: Error) => {
              expect(err instanceof Error).to.equal(true);
              done();
            },
            done,
          );
        emit('error', new Error('test passing'));
      });

    it('should return an observable that emits as expected',
      (done) => {
        const expectedRow = { test: 'thing' };
        createQueryStream(client, 'hello', [])
          .subscribe(
            (row: any) => expect(row).to.deep.equal(expectedRow),
            (err: Error) => {
              expect(err).to.equal(undefined);
              done();
            },
            done,
          );
        emit('row', expectedRow);
        // this call validates the complete state
        emit('end', true);
      });
  });

  describe('createQueryObservable function', () => {
    let client: Client;
    let resolve: Function;
    let reject: Function;

    beforeEach(() => {
      client = <Client>(<any>{
        query: () => (new Promise((p, f) => { resolve = p; reject = f; })),
      });
    });

    it('should return a rejecting observable if client\'s query rejects',
      (done) => {
        createQueryObservable(client, 'hello', [])
          .subscribe(
            () => expect('this case should not happen').to.equal(undefined),
            (err: Error) => {
              expect(err instanceof Error).to.equal(true);
              done();
            },
            done,
          );
        reject(new Error('fail case'));
      });

    it('should trigger an observable if client\'s query resolves',
      (done) => {
        const expectedThing = { test: 'hello' };
        createQueryObservable(client, 'hello', [])
          .subscribe(
            (thing: any) => expect(thing).to.deep.equal(expectedThing),
            (err: Error) => {
              expect(err).to.equal(undefined);
              done();
            },
            done,
          );
        resolve(expectedThing);
      });
  });

  describe('createReduceCompoundInsertOrSelectResults function', () => {
    it('should throw if there are any errors', () => {
      expect(() =>
        createReduceCompoundInsertOrSelectResults(['col1', 'col2'])([[], []])
      ).to.throw(Error);
    });

    it('should return a list of ids if everything is good', () => {
      expect(
        createReduceCompoundInsertOrSelectResults(['col1', 'col2'])(
          [[{id: 1}], [{id: 2}]]
        )
      ).to.deep.equal([1, 2]);
    });
  });

  describe('getClientFrom function', () => {
    let pool: () => any;
    let poolCallback: Function;

    beforeEach(() => {
      pool = () => ({
        connect: (
          callback: (err: Error|null, client: Client, done: Function) => any
        ) => {
          poolCallback = callback;
        },
      });
    });

    it('should error if the callback gets an error', (done) => {
      getClientFrom(pool)
        .subscribe(() => {
            expect('this case should not happen').to.equal(undefined);
          },
          (err) => {
            expect(err instanceof Error).to.equal(true);
            done();
          }, done);
      poolCallback(new Error('test passed!'));
    });

    it('should emit a client if everything is good', (done) => {
      const expectedThing = { type: 'client technically' };
      getClientFrom(pool)
        .subscribe((thing: any) => {
            expect(thing).to.deep.equal(expectedThing);
          },
          (err) => {
            expect('this case should not happen').to.equal(undefined);
            done();
          }, done);
      poolCallback(null, expectedThing);
    });
  });

  describe('hasQueryError', () => {
    it('should return state if state is >= 0', () => {
      expect(hasQueryError(0, [], 7)).to.equal(0);
    });

    it('should return index if state is -1 and element has no length', () => {
      expect(hasQueryError(-1, [], 7)).to.equal(7);
    });

    it('should return -1 if state is -1 and element has length', () => {
      expect(hasQueryError(-1, [{}], 7)).to.equal(-1);
    });
  });

  describe('isValidResult function', () => {
    it('should return false if the result object is falsey', () => {
      expect(isValidResult(undefined)).to.equal(false);
    });

    it('should return false if there is no rows object', () => {
      expect(isValidResult(<any>{})).to.equal(false);
    });

    it('should return false if the rows object is not an array', () => {
      expect(isValidResult(<any>{ rows: {} })).to.equal(false);
    });

    it('should return false if the rows object is an empty array', () => {
      expect(isValidResult(<any>{ rows: [] })).to.equal(false);
    });

    it('should return true if the rows object is an array with length', () => {
      expect(isValidResult(<any>{ rows: [{}] })).to.equal(true);
    });
  });

  describe('reduceByKeys function', () => {
    it('if a set of keys contains index return state with that column', () => {
      expect(reduceByKeys([5])([], 'hello', 5)).to.deep.equal(['hello']);
    });

    it('if a set of keys does not contain an index return state', () => {
      expect(reduceByKeys([5])([], 'hello', 3)).to.deep.equal([]);
    });
  });

  describe('validatePropValsForInput function', () => {
    it('should handle an existing case', () => {
      const expected = {
        cols: ['name'],
        vals: ['jane'],
      };
      const result = validatePropValsForInput({
        name: { type: 'String' },
      }, ['name'], ['jane']);

      expect(result).to.deep.equal(expected);
    });

    it('should handle two existing cases', () => {
      const expected = {
        cols: ['name', 'rank'],
        vals: ['jane', 'major'],
      };
      const result = validatePropValsForInput({
        name: { type: 'String' },
        rank: { type: 'String' },
      }, ['name', 'rank'], ['jane', 'major']);

      expect(result).to.deep.equal(expected);
    });

    it('should skip non existing cases', () => {
      const expected = {
        cols: ['name'],
        vals: ['jane'],
      };
      const result = validatePropValsForInput({
        name: { type: 'String' },
      }, ['name', 'rank'], ['jane', 'major']);

      expect(result).to.deep.equal(expected);
    });
  });
});
