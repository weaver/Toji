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
  'setup': function(done) {
    db = Toji.open('/tmp', 'w+', function(err) {
      if (err) throw err;
      db.load(ready, [
        new Data({ name: 'alpha', value: 'apple' }),
        new Data({ name: 'beta', value: 'banana' }),
        new Data({ name: 'gamma', value: 'grape' }),
        new Data({ name: 'delta', value: 'durian' })
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
      assertResults(results, ['alpha', 'beta', 'gamma', 'delta']);
      done();
    });
  },

  'by attribute': function(done) {
    Data.find({ value: 'grape' }).all(function(err, results) {
      if (err) throw err;
      assertResults(results, ['gamma']);
      several();
    });

    function several() {
      Data.find({ name: 'delta', value: 'durian' }).all(function(err, results) {
        if (err) throw err;
        assertResults(results, ['delta']);
        nothing();
      });
    }

    function nothing() {
      Data.find({ name: 'gamma', value: 'apple' }).all(function(err, results) {
        if (err) throw err;
        Assert.equal(results.length, 0);
        done();
      });
    }
  },

  'using RegExp': function(done) {
    Data.find({ value: /ap/ }).all(function(err, results) {
      if (err) throw err;
      assertResults(results, ['alpha', 'gamma']);
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
        assertResults(results, ['alpha', 'gamma', 'delta']);
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
  }
};

function assertResults(results, expect) {
  var names = results.map(function(o) { return o.name; });
  names.sort();
  expect.sort();
  Assert.deepEqual(names, expect);
}