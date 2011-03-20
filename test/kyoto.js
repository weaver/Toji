var Assert = require('assert'),
    Kyoto = require('../lib/kyoto'),
    db;

module.exports = {

  'open': function(done) {
    Kyoto.open('/tmp/example.kct', 'w+', function(err) {
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

  'close': function(done) {
    db.close(function(err) {
      if (err) throw err;
      done();
    });
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