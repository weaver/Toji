var Assert = require('assert'),
    Kyoto = require('../lib/kyoto'),
    U = require('../lib/util'),
    db, cursor;

module.exports = {

  'open': function(done) {
    Kyoto.open('/tmp/data.kct', 'w+', function(err) {
      if (err) throw err;
      db = this;
      done();
    });
  },

  'set': function(done) {
    db.set('alpha', 'one', function(err) {
      if (err) throw err;
      done();
    });
  },

  'get': function(done) {
    db.get('alpha', function(err, val) {
      if (err) throw err;
      Assert.equal(val, 'one');
      done();
    });
  },

  'set again': function(done) {
    db.set('alpha', 'changed one', function(err) {
      if (err) throw err;
      allEqual(done, { alpha: 'changed one' });
    });
  },

  'add': function(done) {
    db.add('beta', 'two', function(err) {
      if (err) throw err;
      allEqual(done, { alpha: 'changed one', beta: 'two' });
    });
  },

  'add fails': function(done) {
    db.add('beta', 'replaced two', function(err) {
      Assert.ok(err);
      Assert.equal(err.code, Kyoto.DUPREC);
      allEqual(done, { alpha: 'changed one', beta: 'two' });
    });
  },

  'replace': function(done) {
    db.replace('beta', 'replaced two', function(err) {
      if (err) throw err;
      allEqual(done, { alpha: 'changed one', beta: 'replaced two' });
    });
  },

  'replace fails': function(done) {
    db.replace('gamma', 'three', function(err) {
      Assert.ok(err);
      Assert.equal(err.code, Kyoto.NOREC);
      allEqual(done, { alpha: 'changed one', beta: 'replaced two' });
    });
  },

  'remove': function(done) {
    db.remove('alpha', function(err) {
      if (err) throw err;
      allEqual(done, { beta: 'replaced two' });
    });
  },

  'synchronize': function(done) {
    db.synchronize(function(err) {
      if (err) throw err;
      done();
    });
  },

  'close': function(done) {
    db.close(function(err) {
      if (err) throw err;
      done();
    });
  },

  'cursor tests': function(done) {
    db = Kyoto.open('+', 'w+', function(err) {
      if (err) throw err;
      load(done, {
        'alpha': '1',
        'apple': '2',
        'api': '3',
        'aardvark': '4',
        'air': '5',
        'active': '6',
        'arrest': '7',
        'allow': '8'
      });
    });
  },

  'cursor jump': function(done) {
    (cursor = db.cursor()).jump(function(err) {
      if (err) throw err;
      done();
    });
  },

  'cursor get': function(done) {
    cursor.get(function(err, val, key) {
      if (err) throw err;
      Assert.equal(key, 'aardvark');
      Assert.equal(val, '4');
      getStep();
    });

    function getStep() {
      cursor.get(true, function(err, val, key) {
        if (err) throw err;
        Assert.equal(key, 'aardvark');
        getAgain();
      });
    }

    function getAgain() {
      cursor.get(function(err, val, key) {
        if (err) throw err;
        Assert.equal(key, 'active');
        Assert.equal(val, '6');
        done();
      });
    }
  },

  'cursor get key': function(done) {
    cursor.jump(function(err) {
      if (err) throw err;
      cursor.getKey(gotFirst);
    });

    function gotFirst(err, key) {
      if (err) throw err;
      Assert.equal(key, 'aardvark');
      cursor.getKey(true, gotAgain);
    }

    function gotAgain(err, key) {
      if (err) throw err;
      Assert.equal(key, 'aardvark');
      cursor.getKey(gotStep);
    }

    function gotStep(err, key) {
      if (err) throw err;
      Assert.equal(key, 'active');
      done();
    }
  },

  'cursor get value': function(done) {
    cursor.jump(function(err) {
      if (err) throw err;
      cursor.getValue(gotFirst);
    });

    function gotFirst(err, val) {
      if (err) throw err;
      Assert.equal(val, '4');
      cursor.getValue(true, gotAgain);
    }

    function gotAgain(err, val) {
      if (err) throw err;
      Assert.equal(val, '4');
      cursor.getValue(gotStep);
    }

    function gotStep(err, val) {
      if (err) throw err;
      Assert.equal(val, '6');
      done();
    }
  },

  'cursor jump back': function(done) {
    cursor.jumpBack(function(err) {
      if (err) throw err;
      cursor.get(true, lastItem);
    });

    function lastItem(err, val, key) {
      if (err) throw err;
      Assert.equal(key, 'arrest');
      Assert.equal(val, '7');
      cursor.get(emptyItem);
    }

    function emptyItem(err, val, key) {
      if (err) throw err;
      Assert.equal(val, undefined);
      done();
    }
  },

  'cursor jump to': function(done) {
    cursor.jump('ap', function(err) {
      if (err) throw err;
      cursor.getKey(getFirst);
    });

    function getFirst(err, key) {
      if (err) throw err;
      Assert.equal(key, 'api');
      cursor.step(function(err) {
        if (err) throw err;
        cursor.getKey(getSecond);
      });
    }

    function getSecond(err, key) {
      if (err) throw err;
      Assert.equal(key, 'apple');
      done();
    }
  },

  'cursor jump back to': function(done) {
    cursor.jumpBack('alz', function(err) {
      if (err) throw err;
      cursor.getKey(getFirst);
    });

    function getFirst(err, key) {
      if (err) throw err;
      Assert.equal(key, 'alpha');
      cursor.stepBack(function(err) {
        if (err) throw err;
        cursor.getKey(getSecond);
      });
    }

    function getSecond(err, key) {
      if (err) throw err;
      Assert.equal(key, 'allow');
      done();
    }
  }

};


// ## Helpers ##

function allEqual(done, expect) {
  var all = {};

  db.each(assert, function(val, key) {
    all[key] = val;
  });

  function assert(err) {
    if (err) throw err;
    Assert.deepEqual(expect, all);
    done();
  }
}

function load(done, data) {
  U.aEach(data, done, function(val, key, next) {
    db.set(key, val, next);
  });
}

function showEach(done) {
  cursor.get(true, function(err, val, key) {
    if (err || !key)
      done(err);
    else {
      console.log('show:', key, val);
      showEach(done);
    }
  });
}