// # Schema #

var Sys = require('sys'),
    U = require('./util'),
    Type = require('./type');

exports.createType = createType;
exports.name = name;
exports.primitiveName = primitiveName;
exports.classify = classify;
exports.isSchema = isSchema;
exports.isPrimitive = isPrimitive;
exports.isName = isName;
exports.isUnion = isUnion;
exports.isTyped = isTyped;
exports.isNamed = isNamed;
exports.isArray = isArray;
exports.isMap = isMap;


// ## Types ##

function createType(base, schema, methods) {
  if (typeof base != 'function') {
    methods = schema;
    schema = base;
    base = undefined;
  }

  return Type.create(base, methods)
    .extend({
      __name__:   name(schema),
      __schema__: schema
    });
}


// ## Classification ##

// Generate a compact name for a schema.
//
// + name -- Object schema
//
// Returns String name.
function name(schema) {
  if (isPrimitive(schema))
    return primitiveName(schema);
  if (isName(schema))
    return schema;
  else if (isNamed(schema))
    return schema.name;
  else if (isUnion(schema))
    return 'union<' + schema.map(name).join(',') + '>';
  else if (isArray(schema))
    return 'array<' + name(schema.items) + '>';
  else if (isMap(schema))
    return 'array<' + name(schema.values) + '>';

  throw new BadSchema('cannot name', schema);
}

function primitiveName(schema) {
  return schema.type || schema;
}

function classify(schema) {
  if (isPrimitive(schema))
    return primitiveName(schema);
  else if (isName(schema))
    return schema;
  else if (isTyped(schema))
    return schema.type;
  else if (isUnion(schema))
    return 'union';

  throw new BadSchema('cannot classify', schema);
}


// ## Predicates ##

function isSchema(obj) {
  return isName(obj) || isUnion(obj) || isTyped(obj);
}

function isPrimitive(obj) {
  return !!(obj && (obj.type || obj) in PRIMITIVE);
}

function isName(obj) {
  return U.isString(obj);
}

function isUnion(obj) {
  return U.isArray(obj);
}

function isTyped(obj) {
  return U.isPlainObject(obj) && (obj.type !== undefined);
}

function isNamed(obj) {
  return U.isPlainObject(obj) && (obj.name !== undefined);
}

function isArray(obj) {
  return (
    U.isPlainObject(obj)
    && (obj.type == 'array')
    && (obj.items !== undefined)
  );
}

function isMap(obj) {
  return (
    U.isPlainObject(obj)
    && (obj.type == 'map')
    && (obj.values !== undefined)
  );
}

var BadSchema = exports.BadSchema = U.defError(function BadSchema(reason, obj) {
  return reason + ': ' + JSON.stringify(obj);
});

var PRIMITIVE = {
  'null': true,
  'boolean': true,
  'int': true,
  'long': true,
  'float': true,
  'double': true,
  'bytes': true,
  'string': true
};