// # Schema #

var Sys = require('sys'),
    U = require('./util'),
    Type = require('./type');

exports.createType = createType;
exports.name = name;
exports.memberName = memberName;
exports.primitiveName = primitiveName;
exports.classify = classify;
exports.isSchema = isSchema;
exports.isPrimitive = isPrimitive;
exports.isName = isName;
exports.isValidName = isValidName;
exports.isUnion = isUnion;
exports.isTyped = isTyped;
exports.isNamed = isNamed;
exports.isArray = isArray;
exports.isMap = isMap;


// ## Types ##

function createType(base, schema, ctor) {
  if (arguments.length == 2) {
    ctor = schema;
    schema = base;
    base = undefined;
  }

  return Type.create(ctor, base)
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
  else if (Type.isType(schema)) {
    var result = Type.name(schema);
    return ALIASES[result] || result;
  }
  else if (isName(schema))
    return schema;
  else if (isNamed(schema))
    return schema.name;
  else if (isUnion(schema))
    // Note: this is map(name), not map(memberName) because of how the
    // registry keeps track of defined types. If this is problematic
    // for some other reason, make a different function to produce
    // unique names.
    return 'union<' + schema.map(name).join(',') + '>';
  else if (isArray(schema))
    return 'array<' + name(schema.items) + '>';
  else if (isMap(schema))
    return 'map<' + name(schema.values) + '>';

  throw new BadSchema('cannot name', schema);
}

// From the Avro Spec 1.4.1:
//
// Unions may not contain more than one schema with the same type,
// except for the named types record, fixed and enum. For example,
// unions containing two array types or two map types are not
// permitted, but two types with different names are permitted. (Names
// permit efficient resolution when reading and writing unions.)
//
// Unions may not immediately contain other unions.

function memberName(schema) {
  if (isMap(schema))
    return 'map';
  else if (isArray(schema))
    return 'array';
  else if (isUnion(schema))
    throw new BadSchema('union cannot contain union', schema);
  return name(schema);
}

// Map Type.nameOf() names to their avro counterpart.

var ALIASES = {
  'String': 'string',
  'Boolean': 'boolean',
  'Number': 'double',
  'Array': 'array',
  'Object': 'map'
};

function primitiveName(schema) {
  return (schema === null) ? 'null' : (schema.type || schema);
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
  return (obj === null) || isName(obj) || isUnion(obj) || isTyped(obj);
}

function isPrimitive(obj) {
  return (obj === null) || !!(obj && (obj.type || obj) in PRIMITIVE);
}

function isName(obj) {
  return U.isString(obj);
}

function isValidName(obj) {
  return isName(obj) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(obj);
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