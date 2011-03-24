var Assert = require('assert'),
    Toji = require('../lib/index'),
    Storage = require('../lib/storage'),
    Query = require('../lib/query'),
    db;

var Data = Toji.type('ExampleData', {
  name: Toji.ObjectId,
  value: String
});

module.exports = {
  'open': function(done) {
    db = (new Storage.Storage('/tmp'))
      .open('w+', function(err) {
        if (err) throw err;
        done();
      });
  },

  'find empty': function(done) {
    db.find(Data, {}, function(err, results) {
      Assert.ok(!err);
      Assert.deepEqual(results, []);
      done();
    });
  },

  'load': function(done) {
    db.load(loaded, [
      new Data({ name: 'alpha' }),
      new Data({ name: 'beta' }),
      new Data({ name: 'gamma' })
    ]);

    function loaded(err) {
      if (err) throw err;
      done();
    }
  },

  'get': function(done) {
    db.get('ExampleData/gamma', function(err, obj) {
      if (err) throw err;
      Assert.ok(obj instanceof Data);
      Assert.equal(obj.name, 'gamma');
      done();
    });
  },

  'find by id': function(done) {
    db.find(Data, 'beta', function(err, data) {
      if (err) throw err;
      Assert.equal(data.name, 'beta');
      done();
    });
  },

  'find something undefined': function(done) {
    db.find(Data, 'delta', function(err, data) {
      if (err) throw err;
      Assert.ok(!data);
      done();
    });
  },

  'find': function(done) {
    var query = db.find(Data, {});

    Assert.ok(query instanceof Query.Query);

    query.all(function(err, results) {
      if (err) throw err;
      Assert.deepEqual(results.map(function(o) { return o.name; }), ['alpha', 'beta', 'gamma']);
      done();
    });
  },

  'save': function(done) {
    db.find(Data, 'alpha', function(err, data) {
      if (err) throw err;
      db.save(data.attr({ value: 'apple' }), verify);
    });

    function verify(err) {
      if (err) throw err;
      db.find(Data, 'alpha', function(err, data) {
        if (err) throw err;
        Assert.equal(data.value, 'apple');
        done();
      });
    }
  },

  'remove': function(done) {
    db.find(Data, 'beta', function(err, data) {
      if (err) throw err;
      db.remove(data, verify);
    });

    function verify(err) {
      if (err) throw err;
      db.find(Data, 'beta', function(err, data) {
        if (err) throw err;
        Assert.ok(!data);
        done();
      });
    }
  },

  'each': function(done) {
    var all = {};

    db.each(verify, function(obj) {
      all[obj.name] = obj;
    });

    function verify(err) {
      if (err) throw err;
      Assert.deepEqual(Object.keys(all), ['alpha', 'gamma']);
      done();
    }
  },

  'each callback': function(done) {
    var all = {};

    db.each(verify, function(obj, next) {
      all[obj.name] = obj;
      next();
    });

    function verify(err) {
      if (err) throw err;
      Assert.deepEqual(Object.keys(all), ['alpha', 'gamma']);
      done();
    }
  },

  'close': function(done) {
    db.close(function(err) {
      if (err) throw err;
      done();
    });
  }
};
