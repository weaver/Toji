var Assert = require('assert'),
    Schema = require('../../lib/avro/schema'),
    Registry = require('../../lib/avro/registry').Registry;

module.exports = {
  'simple array': function() {
    var type = define({ type: 'array', items: 'int' });

    Assert.equal(Schema.name(type), 'array<int>');
    Assert.deepEqual({ type: 'array', items: 'int' }, type.__schema__);

    idempotent([], type);
    idempotent([1, 2, 3], type);

    invalid(1, type);
    invalid({ a: 1 }, type);
  },

  'simple map': function() {
    var type = define({ type: 'map', values: 'string' });

    Assert.equal(Schema.name(type), 'map<string>');
    Assert.deepEqual({ type: 'map', values: 'string' }, type.__schema__);

    idempotent({}, type);
    idempotent({ a: "apple", b: "jack" }, type);

    invalid(["apple", "jack"], type);
    invalid("apple", type);
    invalid({ a: 1 }, type);
  },

  'simple union': function() {
    var type = define(['int', null]);

    Assert.equal(Schema.name(type), 'union<int,null>');
    Assert.deepEqual(['int', 'null'], type.__schema__);

    idempotent(null, type);
    idempotent(1, type, { "int": 1 });
  },

  'union declaration': function() {
    define(['int', 'null']);
    define([{ type: 'array', items: 'int' }, { type: 'map', values: 'string' }]);

    // Unions can't contain unions
    invalidSchema(['int', [null]]);

    // Unions can't have two arrays or maps
    invalidSchema([{ type: 'map', values: 'int' }, { type: 'map', values: 'string' }]);
    invalidSchema([{ type: 'array', items: 'int' }, { type: 'array', items: 'string' }]);
  },

  'simple record': function() {
    var schema = {
      type: 'record',
      name: 'example',
      fields: [
        { name: 'a', type: ['int', 'null'] },
        { name: 'b', type: { type: 'array', items: 'string' } }
      ]
    };

    var example = define(schema);

    Assert.equal(Schema.name(example), 'example');
    Assert.deepEqual(schema, example.__schema__);

    idempotent(
      new example({ a: 1, b: ["hello", "world"] }),
      example,
      { a: { "int": 1 }, b: ["hello", "world"] }
    );

    invalid({ a: 1 }, schema);
  },

  'complex records': function() {
    var reg = new Registry(),
        A = reg.define({
          name: 'A',
          type: 'record',
          fields: [{ name: 'value', type: 'string' }]
        }),
        B = reg.define({
          name: 'B',
          type: 'record',
          fields: [{ name: 'a', type: A }]
        });

    Assert.deepEqual(B.__schema__, {
      name: 'B',
      type: 'record',
      fields: [{ name: 'a', type: 'A' }]
    });

    Assert.deepEqual(B.schemaOf('a'), { name: 'a', type: 'A' });

    B.validate({ a: new A({ value: 'hello' }) });
    idempotent({ a: new A({ value: 'hello' }) }, B, { a: { value: 'hello' } });

    invalid({}, B);
    invalid({ a: {} }, B);
  },

  'default values': function() {
    var reg = new Registry(),
        A = reg.define({
          name: 'A',
          type: 'record',
          fields: [{ name: 'value', type: 'string' }]
        }),
        B = reg.define({
          name: 'B',
          type: 'record',
          fields: [
            { name: 'a', type: 'null', 'default': null },
            { name: 'b', type: 'boolean', 'default': true },
            { name: 'c', type: 'int', 'default': 42 },
            { name: 'd', type: 'string', 'default': 'hello' },
            { name: 'e', type: { type: 'array', items: 'string' }, 'default': ['alpha', 'beta'] },
            { name: 'f', type: { type: 'array', items: 'A' }, 'default': [{ value: 'gamma' }, { value: 'delta' }] },
            { name: 'g', type: { type: 'map', values: 'double' }, 'default': { a: 1, b: 2 } },
            { name: 'h', type: { type: 'map', values: 'A' }, 'default': { a: { value: 'epsilon' } } },
            { name: 'i', type: ['A', 'string'], 'default': { value: 'zeta' } },
            { name: 'j', type: 'A', 'default': { value: 'eta' } }
          ]
        });

    var item = new B({});

    // Verify that copies were made.
    item.e.push('theta');
    item.g.c = 3;
    Assert.deepEqual(B.schemaOf('e')['default'], ['alpha', 'beta']);
    Assert.deepEqual(B.schemaOf('g')['default'], { a: 1, b: 2 });

    // Verify that instances were made.
    Assert.ok(item.f[0] instanceof A);
    Assert.ok(item.h.a instanceof A);
    Assert.ok(item.i instanceof A);
    Assert.ok(item.j instanceof A);

    Assert.deepEqual(item.exportJSON(), {
      a: null,
      b: true,
      c: 42,
      d: 'hello',
      e: ['alpha', 'beta', 'theta'],
      f: [{ value: 'gamma' }, { value: 'delta' }],
      g: { a: 1, b: 2, c: 3 },
      h: { a: { value: 'epsilon' } },
      i: { A: { value: 'zeta' } },
      j: { value: 'eta' }
    });
  }

};


// ## Helpers ##

function define(base, schema) {
  var reg = new Registry();
  return reg.define(base, schema);
}

function idempotent(value, type, repr) {
  if (arguments.length < 3)
    repr = value;

  Assert.deepEqual(value, type.loadJSON(repr));
  Assert.deepEqual(repr, type.dumpJSON(value));
  Assert.deepEqual(repr, type.exportJSON(value));

  type.validate(value);

  return value;
}

function invalid(value, type) {
  try {
    type.validate(value);
    Assert.ok(false, 'Expected validation to fail.');
  } catch (x) {
    // success
  }
}

function invalidSchema(schema) {
  try {
    define(schema);
    Assert(false, 'Expected bad schema');
  } catch (x) {
    if (x.name != 'BadSchema' && x.name != 'Invalid')
      throw x;
  }
}