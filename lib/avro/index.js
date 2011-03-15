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

exports.ArrayType = Complex.ArrayType;
exports.MapType = Complex.MapType;
exports.UnionType = Complex.UnionType;
exports.RecordType = Complex.RecordType;
exports.Field = Complex.Field;
exports.Invalid = Complex.Invalid;
exports.InvalidField = Complex.InvalidField;


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
  var probe;

  if (Type.isType(obj))
    probe = Type.name(obj);
  else if (Schema.isSchema(obj))
    probe = Schema.name(obj);

  if (probe)
    return TYPES.resolve(probe);

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