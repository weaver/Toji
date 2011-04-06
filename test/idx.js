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

module.exports = {
  'setup': function(done) {
    db = Toji.open('*memory*', function(err) {
      if (err) throw err;
      db.load(done, [
        new IndexData({ id: 'a', letter: 'alpha', number: 1 }),
        new IndexData({ id: 'b', letter: 'beta', number: 2 }),
        new IndexData({ id: 'c', letter: 'gamma', number: 3 })
      ]);
    });
  },

  'indexes look like this': function(done) {
    indexState(function(err, state) {
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
        verify();
      });

    function verify() {
      indexState(function(err, state) {
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
    }
  },

  'must be unique on-update': function(done) {
    IndexData.find({ letter: 'alpha' }).one(function(err, alpha) {
      if (err) throw err;
      Assert.ok(alpha);
      alpha.attr({ letter: 'gamma' }).save(function(err) {
        Assert.ok(err);
        Assert.deepEqual(alpha.errors, { letter: ["oops, it's already taken"] });
        verify();
      });
    });

    function verify() {
      indexState(function(err, state) {
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
    }
  },

  'otherwise, updating works': function(done) {
    IndexData.find({ letter: 'alpha' }).one(function(err, alpha) {
      if (err) throw err;
      Assert.ok(alpha);
      alpha.attr({ letter: 'delta', number: 4 }).save(function(err) {
        if (err) throw err;
        verify();
      });
    });

    function verify() {
      indexState(function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '%IndexData.letter{delta}': 'IndexData/a',
          '%IndexData.letter{beta}': 'IndexData/b',
          '%IndexData.letter{gamma}': 'IndexData/c',
          '%IndexData.number{4}': 'IndexData/a',
          '%IndexData.number{2}': 'IndexData/b',
          '%IndexData.number{3}': 'IndexData/c'
        });

        done();
      });
    }
  },

  'removing cleans up indicies': function(done) {
    IndexData.find({ letter: 'alpha' }).one(function(err, alpha) {
      if (err) throw err;
      alpha.remove(verify);
    });

    function verify(err) {
      if (err) throw err;

      indexState(function(err, state) {
        if (err) throw err;

        Assert.deepEqual(state, {
          '%IndexData.letter{beta}': 'IndexData/b',
          '%IndexData.letter{gamma}': 'IndexData/c',
          '%IndexData.number{2}': 'IndexData/b',
          '%IndexData.number{3}': 'IndexData/c'
        });

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
  }

};


// ## Helpers ##

function indexState(next) {
  IndexData.getUniqueIndex('letter').all(db, function(err, letter) {
    if (err)
      next(err);
    else
      IndexData.getUniqueIndex('number').all(db, function(err, number) {
        err ? next(err) : next(null, U.extend(letter, number));
      });
  });
}