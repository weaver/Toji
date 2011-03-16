var Assert = require('assert'),
    Schema = require('../lib/avro/schema'),
    Registry = require('../lib/avro/registry').Registry;

module.exports = {
  'null': function() {
    var schema = define('null');

    Assert.equal(Schema.name(schema), 'null');
    Assert.equal(Schema.schema(schema), 'null');

    idempotent(null, schema);

    invalid(true, schema);
    invalid(42, schema);
    invalid("mumble", schema);
  },

  'boolean': function() {
    var schema = define('boolean');

    Assert.equal(Schema.name(schema), 'boolean');
    Assert.equal(Schema.schema(schema), 'boolean');

    idempotent(true, schema);
    idempotent(false, schema);

    invalid(null, schema);
    invalid(42, schema);
    invalid("mumble", schema);
  },

  'int': function() {
    var schema = define('int');

    Assert.equal(Schema.name(schema), 'int');
    Assert.equal(Schema.schema(schema), 'int');

    idempotent(1065, schema);

    invalid(null, schema);
    invalid(true, schema);
    invalid(3.14, schema);
    invalid(Math.pow(2, 31), schema);
    invalid("mumble", schema);
  },

  'long': function() {
    var schema = define('long');

    Assert.equal(Schema.name(schema), 'long');
    Assert.equal(Schema.schema(schema), 'long');

    idempotent(Math.pow(2, 31), schema);

    invalid(null, schema);
    invalid(true, schema);
    invalid(3.14, schema);
    invalid(Math.pow(2,63), schema);
    invalid("mumble", schema);
  },

  'float': function() {
    var schema = define('float');

    Assert.equal(Schema.name(schema), 'float');
    Assert.equal(Schema.schema(schema), 'float');

    idempotent(1065, schema);
    idempotent(3.14, schema);
    idempotent(3.3e38, schema);
    idempotent(Number.POSITIVE_INFINITY, schema);

    invalid(null, schema);
    invalid(true, schema);
    invalid("mumble", schema);
    invalid(3.5e38, schema);
  },

  'double': function() {
    var schema = define('double');

    Assert.equal(Schema.name(schema), 'double');
    Assert.equal(Schema.schema(schema), 'double');

    idempotent(1065, schema);
    idempotent(3.14, schema);
    idempotent(Number.POSITIVE_INFINITY, schema);

    invalid(null, schema);
    invalid(true, schema);
    invalid("mumble", schema);
    invalid(1.8e308, schema);
  },

  'string': function() {
    var schema = define('string');

    Assert.equal(Schema.name(schema), 'string');
    Assert.equal(Schema.schema(schema), 'string');

    idempotent("", schema);
    idempotent("Hello, world!", schema);

    invalid(null, schema);
    invalid(true, schema);
    invalid(42, schema);
    invalid(1.5, schema);
  }
};


// ## Helpers ##

function define(base, schema) {
  var reg = new Registry();
  return reg.define(base, schema);
}

function idempotent(value, schema) {
  Assert.equal(value, schema.loadJSON(value));
  Assert.equal(value, schema.dumpJSON(value));
  Assert.equal(value, schema.exportJSON(value));

  try {
    schema.validate(value);
  } catch (x) {
    Assert.ok(false, x);
  }

  return value;
}

function invalid(value, schema) {
  try {
    schema.validate(value);
    Assert.ok(false, 'Expected validation to fail.');
  } catch (x) {
    // success
  }
}