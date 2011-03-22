var Assert = require('assert'),
    Toji = require('../lib/index'),
    db;

module.exports = {
  'setup': function(done) {
    db = Toji.open('/tmp', 'w+', done);
  },

  'simple type schema': function(done) {
    var SimpleItem = Toji.type('SimpleItem', {
      name: String,
      quantity: Number
    });

    Assert.deepEqual(SimpleItem.__schema__, {
      type: 'record',
      name: 'SimpleItem',
      fields: [
        { type: ['string', 'null'], name: 'name' },
        { type: ['double', 'null'], name: 'quantity'  }
      ]
    });

    Assert.equal(SimpleItem.__pk__, 'id');

    done();
  },

  'simple type data': function(done) {
    var Item = Toji.type('SimpleItem');

    var item = new Item({ name: 'apple', quantity: 5 }),
        saved;

    Assert.deepEqual(item.json(), { name: 'apple', quantity: 5 });
    Assert.deepEqual(saved = item.dumpJSON(), { name: {"string": "apple"}, quantity: {"double": 5}});
    Assert.deepEqual(Item.loadJSON(saved).dumpJSON(), saved);

    done();
  },

  'manual ids': function(done) {
    var UserModel = Toji.type('UserModel', {
      username: Toji.ObjectId,
      password: String
    });

    Assert.equal(UserModel.__pk__, 'username');

    var item = new UserModel({ username: 'sam', password: 'iam' }),
        saved;

    Assert.deepEqual(item.json(), { username: 'sam', password: 'iam' });
    Assert.deepEqual(saved = item.dumpJSON(), { username: {"string": "sam"}, password: {"string": "iam"}});
    Assert.deepEqual(UserModel.loadJSON(saved).dumpJSON(), saved);

    done();
  },

  'complex type schema': function(done) {
    var Item = Toji.type('SimpleItem'),
        User = Toji.type('UserModel');

    var Box = Toji.type('Box', {
      value: Toji.union(Item, User),
      values: [Toji.union(Item, User)],
      point: { x: String, y: String }
    });

    Assert.deepEqual(Box.__schema__, {
      type: 'record',
      name: 'Box',
      fields: [
        { type: ['SimpleItem', 'UserModel', 'null'], name: 'value' },
        { type: [{ type: 'array', items: ['SimpleItem', 'UserModel'] }, 'null'], name: 'values' },
        { type: ['Box.point', 'null'], name: 'point'  }
      ]
    });

    var BoxPoint = Toji.type('Box.point');

    Assert.deepEqual(BoxPoint.__schema__, {
      type: 'record',
      name: 'Box.point',
      fields: [
        { type: ['string', 'null'], name: 'x' },
        { type: ['string', 'null'], name: 'y'  }
      ]
    });

    done();
  },

  'complex type data': function(done) {
    var Item = Toji.type('SimpleItem'),
        User = Toji.type('UserModel'),
        Box = Toji.type('Box');

    var item = new Item({ name: 'alpha', quantity: 0 }),
        u1 = new User({ username: 'u1', password: 'p1' }),
        u2 = new User({ username: 'u2', password: 'p2' }),
        box = new Box({ value: u1, values: [item, u2], point: {x: "1", y: "2"} }),
        saved;

    Assert.deepEqual(box.json(), {
      value: { 'UserModel': { username: 'u1', password: 'p1' } },
      values: [
        { 'SimpleItem': { name: 'alpha', quantity: 0 } },
        { 'UserModel': { username: 'u2', password: 'p2' } }
      ],
      point: {x: '1', y: '2'}
    });

    Assert.deepEqual(saved = box.dumpJSON(), {
      value: { 'UserModel': { username: { string: 'u1' }, password: { string: 'p1' } } },
      values: { 'array': [
        { 'SimpleItem': { name: { string: 'alpha' }, quantity: { 'double': 0 } } },
        { 'UserModel': { username: { string: 'u2' }, password: { string: 'p2' } } }
      ] },
      point: {'Box.point': {x: { string: '1' }, y: { string: '2' } } }
    });

    Assert.deepEqual(Box.loadJSON(saved).dumpJSON(), saved);

    done();
  },

  'refs': function(done) {
    var Item = Toji.type('SimpleItem');

    var Tree = Toji.type('Tree', {
      self: Toji.ref(Item),
      children: [Toji.ref(Item)]
    });

    Assert.deepEqual(Tree.__schema__, {
      type: 'record',
      name: 'Tree',
      fields: [
        { type: ['string', 'null'], name: 'self', references: 'SimpleItem' },
        { type: [{ type: 'array', items: 'string' }, 'null'], name: 'children', references: 'SimpleItem' }
      ]
    });

    db.load(ready, [
      new Item({ name: 'a', quantity: 1 }),
      new Item({ name: 'b', quantity: 2 }),
      new Item({ name: 'c', quantity: 3 })
    ]);

    function ready(err) {
      if (err) throw err;
      allBy(Item, 'name', function(items) {
        (new Tree({ self: items.a, children: [items.b, items.c] })).save(saved);
      });
    }

    function saved(err, obj) {
      if (err) throw err;
      Tree.find(obj.id, loaded);
    }

    function loaded(err, obj) {
      if (err) throw err;

      Assert.equal(typeof obj.self, 'string');
      Assert.equal(obj.children.length, 2);
      Assert.equal(typeof obj.children[0], 'string');

      obj.include('self', 'children', included);
    }

    function included(err, obj) {
      if (err) throw err;

      Assert.ok(obj.self instanceof Item);
      Assert.equal(obj.self.name, 'a');
      Assert.ok(obj.children[0] instanceof Item);
      Assert.equal(obj.children[0].name, 'b');
      Assert.equal(obj.children[1].name, 'c');

      done();
    }
  },

  'triggers': function(done) {
    var UserModel = Toji.type('UserModel');

    UserModel
      .beforeSave(function(obj, creating) {
        obj.before = creating;
      })
      .afterSave(function(obj, created) {
        obj.after = created;
      })
      .afterLoad(function(obj) {
        obj.load = true;
      });

    var user = new UserModel({ username: 'john', password: 'secret' });
    Assert.equal(user.before, undefined);
    Assert.equal(user.after, undefined);
    Assert.equal(user.load, undefined);

    user.save(function(err, created) {
      if (err) throw err;
      Assert.equal(user.before, true);
      Assert.equal(user.after, true);
      Assert.equal(user.load, undefined);
      UserModel.find('john', loaded);
    });

    function loaded(err, obj) {
      if (err) throw err;
      Assert.equal(obj.before, undefined);
      Assert.equal(obj.after, undefined);
      Assert.equal(obj.load, true);

      obj.attr({ password: 'changed' }).save(function(err) {
        if (err) throw err;
        Assert.equal(obj.before, false);
        Assert.equal(obj.after, false);
        Assert.equal(obj.load, true);
        done();
      });
    }

  }

};


// ## Helpers ##

function allBy(type, attr, next) {
  type.find({}, function(err, results) {
    if (err) throw err;

    var all = {};
    results.forEach(function(item) {
      all[item[attr]] = item;
    });
    next(all);
  });
}