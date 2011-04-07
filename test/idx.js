var Assert = require('assert'),
    Toji = require('../lib/index'),
    U = require('../lib/util'),
    db;

var IndexData = Toji.type('IndexData', {
  id: Toji.ObjectId,
  letter: String,
  number: Number
})
.validatesUniquenessOf(['letter', 'number'], "oops, it's already taken");

var IndexTree = Toji.type('IndexTree', {
  id: Toji.ObjectId,
  group: Toji.ref('IndexTree'),
  parent: Toji.ref('IndexTree'),
  value: String
})
.beforeSave(function(obj, creating) {
  if (creating && obj.parent)
    obj.group = obj.parent.group || obj.parent;
})
.addIndex('group', function(obj) {
  return obj.group || obj;
});

module.exports = {
  'setup': function(done) {
    db = Toji.open('*memory*', function(err) {
      if (err) throw err;

      db.load(makeTree, [
        new IndexData({ id: 'a', letter: 'alpha', number: 1 }),
        new IndexData({ id: 'b', letter: 'beta', number: 2 }),
        new IndexData({ id: 'c', letter: 'gamma', number: 3 })
      ]);

      function makeTree(parent) {
        var r1, m1, r2;
        db.load(done, [
          r1 = (new IndexTree({ id: 'a', value: 'top-level' })),
          m1 = new IndexTree({ id: 'b', value: 'mid-level', parent: r1 }),
          new IndexTree({ id: 'c', value: 'mid-leaf', parent: r1 }),
          new IndexTree({ id: 'd', value: 'leaf', parent: m1 }),
          r2 = new IndexTree({ id: 'e', value: 'top 2' }),
          new IndexTree({ id: 'f', value: 'leaf 2', parent: r2 }),
          new IndexTree({ id: 'g', value: 'top 3' })
        ]);
      }
    });
  },

  'unique indexes look like this': function(done) {
    indexState(IndexData, function(err, state) {
      if (err) throw err;

      Assert.deepEqual(state, {
        '%IndexData.letter{alpha}': 'IndexData/a',
        '%IndexData.letter{beta}': 'IndexData/b',
        '%IndexData.letter{gamma}': 'IndexData/c',
        '%IndexData.number{1}': 'IndexData/a',
        '%IndexData.number{2}': 'IndexData/b',
        '%IndexData.number{3}': 'IndexData/c'
      });

      done();
    });
  },

  'must be unique on-validate': function(done) {
    // Uniqueness enforcement is only guaranteed during a save. To
    // save effort during validate/save, checking uniqueness is
    // deferred unless the object is already in an error state.
    //
    // Also, since a uniqueness check is async, it's only done if
    // `next` is given to `isValid()`.
    //
    // Introduce an error state on purpose by leaving values out.
    (new IndexData({ number: 2 }))
      .isValid(function(err, valid, obj) {
        if (err) throw err;
        Assert.ok(!valid);
        Assert.deepEqual(obj.errors, {
          'id': ['missing required value'],
          'letter': ["expected non-null value"],
          'number': ["oops, it's already taken"]
        });

        done();
      });
  },

  'must be unique on-create': function(done) {
    (new IndexData({ id: 'd', letter: 'alpha', number: 2 }))
      .save(function(err, obj) {
        Assert.ok(err);
        Assert.deepEqual(obj.errors, {
          'letter': ["oops, it's already taken"],
          'number': ["oops, it's already taken"]
        });
        verifyState();
      });

    function verifyState() {
      indexState(IndexData, function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '%IndexData.letter{alpha}': 'IndexData/a',
          '%IndexData.letter{beta}': 'IndexData/b',
          '%IndexData.letter{gamma}': 'IndexData/c',
          '%IndexData.number{1}': 'IndexData/a',
          '%IndexData.number{2}': 'IndexData/b',
          '%IndexData.number{3}': 'IndexData/c'
        });

        verifyData();
      });
    }

    function verifyData() {
      IndexData.find({}).all(function(err, data) {
        Assert.deepEqual(data, [
          { id: 'a', letter: 'alpha', number: 1 },
          { id: 'b', letter: 'beta', number: 2 },
          { id: 'c', letter: 'gamma', number: 3 }
        ]);
        done();
      });
    }
  },

  'must be unique on-update': function(done) {
    IndexData.find({ letter: 'alpha' }).one(function(err, alpha) {
      if (err) throw err;
      Assert.ok(alpha);
      alpha.attr({ letter: 'gamma' }).save(function(err) {
        Assert.ok(err);
        Assert.deepEqual(alpha.errors, { letter: ["oops, it's already taken"] });
        verifyState();
      });
    });

    function verifyState() {
      indexState(IndexData, function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '%IndexData.letter{alpha}': 'IndexData/a',
          '%IndexData.letter{beta}': 'IndexData/b',
          '%IndexData.letter{gamma}': 'IndexData/c',
          '%IndexData.number{1}': 'IndexData/a',
          '%IndexData.number{2}': 'IndexData/b',
          '%IndexData.number{3}': 'IndexData/c'
        });

        verifyData();
      });
    }

    function verifyData() {
      IndexData.find({}).all(function(err, data) {
        Assert.deepEqual(data, [
          { id: 'a', letter: 'alpha', number: 1 },
          { id: 'b', letter: 'beta', number: 2 },
          { id: 'c', letter: 'gamma', number: 3 }
        ]);
        done();
      });
    }
  },

  'updating keeps unique indicies in sync': function(done) {
    IndexData.find({ letter: 'alpha' }).one(function(err, alpha) {
      if (err) throw err;
      Assert.ok(alpha);
      alpha.attr({ letter: 'delta', number: 4 }).save(function(err) {
        if (err) throw err;
        verifyState();
      });
    });

    function verifyState() {
      indexState(IndexData, function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '%IndexData.letter{delta}': 'IndexData/a',
          '%IndexData.letter{beta}': 'IndexData/b',
          '%IndexData.letter{gamma}': 'IndexData/c',
          '%IndexData.number{4}': 'IndexData/a',
          '%IndexData.number{2}': 'IndexData/b',
          '%IndexData.number{3}': 'IndexData/c'
        });

        verifyData();
      });
    }

    function verifyData() {
      IndexData.find({}).all(function(err, data) {
        Assert.deepEqual(data, [
          { id: 'a', letter: 'delta', number: 4 },
          { id: 'b', letter: 'beta', number: 2 },
          { id: 'c', letter: 'gamma', number: 3 }
        ]);
        done();
      });
    }
  },

  'removing cleans up unique indicies': function(done) {
    IndexData.find({ letter: 'alpha' }).one(function(err, alpha) {
      if (err) throw err;
      alpha.remove(verifyState);
    });

    function verifyState(err) {
      if (err) throw err;

      indexState(IndexData, function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '%IndexData.letter{beta}': 'IndexData/b',
          '%IndexData.letter{gamma}': 'IndexData/c',
          '%IndexData.number{2}': 'IndexData/b',
          '%IndexData.number{3}': 'IndexData/c'
        });

        verifyData();
      });
    }

    function verifyData() {
      IndexData.find({}).all(function(err, data) {
        Assert.deepEqual(data, [
          { id: 'b', letter: 'beta', number: 2 },
          { id: 'c', letter: 'gamma', number: 3 }
        ]);
        done();
      });
    }
  },

  'locking guards access to objects by key': function(done) {
    var manager = db.idxManager,
        seq = [],
        release;

    manager.withLock('key', noop, function(unlock) {
      release = unlock;
    });

    manager.withLock('key', noop, function(unlock) {
      seq.push(1);
      unlock();
    });

    manager.withLock('key', noop, function(unlock) {
      seq.push(2);
      unlock();
    });

    process.nextTick(function() {
      Assert.deepEqual(seq, []);

      release();

      manager.withLock('key', verify, function(unlock) {
        seq.push(3);
        unlock();
      });
    });

    function noop(err) {
      if (err) throw err;
    }

    function verify(err) {
      if (err) throw err;
      Assert.deepEqual(seq, [1, 2, 3]);
      done();
    }
  },

  'plain indexes look like this': function(done) {
    indexState(IndexTree, function(err, state) {
      if (err) throw err;

      Assert.deepEqual(state, {
        '#IndexTree.group{a}IndexTree/a': 'IndexTree/a',
        '#IndexTree.group{a}IndexTree/b': 'IndexTree/b',
        '#IndexTree.group{a}IndexTree/c': 'IndexTree/c',
        '#IndexTree.group{a}IndexTree/d': 'IndexTree/d',
        '#IndexTree.group{e}IndexTree/e': 'IndexTree/e',
        '#IndexTree.group{e}IndexTree/f': 'IndexTree/f',
        '#IndexTree.group{g}IndexTree/g': 'IndexTree/g'
      });

      done();
    });
  },

  'plain indexes are synced on-update': function(done) {
    var root;

    IndexTree.find('e', function(err, obj) {
      if (err) throw err;
      root = obj;
      move();
    });

    function move() {
      IndexTree.find({ id: 'g' }).one(function(err, obj) {
        if (err) throw err;
        obj.group = obj.parent = root;
        obj.save(verifyState);
      });
    }

    function verifyState(err) {
      if (err) throw err;

      indexState(IndexTree, function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '#IndexTree.group{a}IndexTree/a': 'IndexTree/a',
          '#IndexTree.group{a}IndexTree/b': 'IndexTree/b',
          '#IndexTree.group{a}IndexTree/c': 'IndexTree/c',
          '#IndexTree.group{a}IndexTree/d': 'IndexTree/d',
          '#IndexTree.group{e}IndexTree/e': 'IndexTree/e',
          '#IndexTree.group{e}IndexTree/f': 'IndexTree/f',
          '#IndexTree.group{e}IndexTree/g': 'IndexTree/g'
        });

        verifyData();
      });
    }

    function verifyData() {
      IndexTree.find({ group: root.id })
        .all(function(err, group) {
          if (err) throw err;
          Assert.deepEqual(group, [
            { id: 'e', group: null, parent: null, value: 'top 2' },
            { id: 'f', group: 'e', parent:'e', value: 'leaf 2' },
            { id: 'g', group: 'e', parent:'e', value: 'top 3' }
          ]);
          done();
        });
    }
  }
};


// ## Helpers ##

function indexState(type, done) {
  var state = {};

  U.aEach(type.indicies.indicies, finished, function(idx, _, next) {
    idx.all(db, function(err, values) {
      if (err)
        next(err);
      else {
        U.extend(state, values);
        next();
      }
    });
  });

  function finished(err) {
    done(err, state);
  }
}