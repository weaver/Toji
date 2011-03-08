// # Avro #

var Reg = require('./registry'),
    Schema = require('./schema'),
    Type = require('./type'),
    Complex = require('./complex'),
    U = require('./util');

exports.type = type;
exports.alias = alias;
exports.name = name;
exports.isInstance = Type.isInstance;
exports.isSubclass = Type.isSubclass;
exports.typeOf = Type.of;
exports.nameOf = Type.nameOf;
exports.dumpJSON = dumpJSON;
exports.loadJSON = loadJSON;
exports.exportJSON = exportJSON;
exports.RecordType = Complex.RecordType;
exports.Field = Complex.Field;


// ## Global Registry ##

var TYPES = new Reg.Registry();

function type(base, schema) {
  if (arguments.length == 1 && Schema.isName(base))
    return TYPES.get(base);
  return TYPES.define(base, schema);
}

function alias(name, schema) {
  TYPES.alias(name, schema);
}

function name(obj) {
  if (Type.isType(obj))
    return Type.name(obj);
  else if (Schema.isSchema(obj))
    return Schema.name(obj);

  throw new Type.ValueError('expected type or schema', obj);
}


// ## Serialization ##

function dumpJSON(obj) {
  return JSON.stringify(Type.of(obj).dumpJSON(obj));
}

function exportJSON(obj) {
  return JSON.stringify(Type.of(obj)).exportJSON(obj);
}

function loadJSON(type, data) {
  return type.loadJSON(JSON.parse(data));
}