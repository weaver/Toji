var Assert = require('assert'),
    Toji = require('../lib/index'),
    Query = require('../lib/query'),
    db;

var Data = Toji.type('QueryData', {
  name: Toji.ObjectId,
  value: String
});

var Tree = Toji.type('QueryTree', {
  self: Toji.ref(Data),
  children: [Toji.ref(Data)]
});

module.exports = {
  'open': function(done) {
    db = Toji.open('*memory*', function(err) {
      if (err) throw err;
      db.load(ready, [
        new Data({ name: 'alpha', value: 'one' }),
        new Data({ name: 'beta', value: 'two' }),
        new Data({ name: 'gamma', value: 'three' }),
        new Data({ name: 'delta', value: 'four' })
      ]);
    });

    function ready(err) {
      if (err) throw err;
      done();
    }
  },

  'by id': function(done) {
    var query = Data.find('beta');

    Assert.ok(query instanceof Query.Query);

    query.all(function(err, results) {
      if (err) throw err;
      Assert.equal(results.length, 1);
      Assert.equal(results[0].name, 'beta');
      one();
    });

    function one() {
      query.one(function(err, obj) {
        if (err) throw err;
        Assert.equal(obj.name, 'beta');
        done();
      });
    }
  },

  'everything': function(done) {
    Data.find({}).all(function(err, results) {
      if (err) throw err;
      assertResults(results, ['alpha', 'beta', 'delta', 'gamma']);
      done();
    });
  },

  'offset': function(done) {
    Data.find({})
      .offset(2)
      .all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['delta', 'gamma']);
        done();
      });
  },

  'limit': function(done) {
    Data.find({})
      .limit(2)
      .all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['alpha', 'beta']);
        done();
      });
  },

  'slice': function(done) {
    Data.find({})
      .slice(1, 3)
      .all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['beta', 'delta']);
        done();
      });
  },

  'by attribute': function(done) {
    Data.find({ value: 'three' }).all(function(err, results) {
      if (err) throw err;
      assertResults(results, ['gamma']);
      several();
    });

    function several() {
      Data.find({ name: 'delta', value: 'four' }).all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['delta']);
        nothing();
      });
    }

    function nothing() {
      Data.find({ name: 'gamma', value: 'four' }).all(function(err, results) {
        if (err) throw err;
        Assert.equal(results.length, 0);
        done();
      });
    }
  },

  'using RegExp': function(done) {
    Data.find({ value: /^t/ }).all(function(err, results) {
      if (err) throw err;
      assertResults(results, ['beta', 'gamma']);
      done();
    });
  },

  'using callback': function(done) {
    Data.find({})
      .filter(function(obj) {
        return obj.name.length == 5;
      })
      .all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['alpha', 'delta', 'gamma']);
        done();
      });
  },

  'order ascending': function(done) {
    Data.find({})
      .order('value')
      .all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['delta', 'alpha', 'gamma', 'beta']);
        done();
      });
  },

  'order descending': function(done) {
    Data.find({})
      .order('-value')
      .all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['beta', 'gamma', 'alpha', 'delta']);
        done();
      });
  },

  'include': function(done) {
    Data.find({}, function(err, results) {
      if (err) throw err;
      (new Tree({ self: results.shift(), children: results }))
        .save(justIds);
    });

    function justIds(err) {
      if (err) throw err;
      Tree.find({}).one(function(err, tree) {
        if (err) throw err;
        Assert.ok(typeof tree.self == 'string');
        Assert.equal(tree.children.length, 3);
        Assert.ok(typeof tree.children[0] == 'string');
        included();
      });
    }

    function included() {
      Tree.find({})
        .include('self', 'children')
        .one(function(err, tree) {
          if (err) throw err;
          Assert.ok(tree.self instanceof Data);
          Assert.equal(tree.children.length, 3);
          Assert.ok(tree.children[0] instanceof Data);
          done();
        });
    }
  },

  'full stack': function(done) {
    Tree.find({})
      .order('self')
      .slice(0, 1)
      .include('self', 'children')
      .all(function(err, results) {
        if (err) throw err;
        Assert.equal(results.length, 1);
        Assert.ok(results[0].self instanceof Data);
        Assert.equal(results[0].children.length, 3);
        Assert.ok(results[0].children[0] instanceof Data);
        done();
      });
  }
};

function assertResults(results, expect) {
  var names = results.map(function(o) { return o.name; });
  Assert.deepEqual(names, expect);
}