var Avro = require('./avro'),
    U = require('./util');

exports.DB = DB;

function DB() {
  this.schema = addBuiltins(new Avro.Registry());
}

DB.prototype.type = function(name, fields) {
  var reg = this.schema,
      schema = { type: 'record', name: name, fields: parseFields(reg, fields) };
  return reg.type(schema);
};

DB.prototype.load = Avro.load;
DB.prototype.dump = Avro.dump;


// ## Fields ##

function parseFields(reg, fields) {
  var result = [],
      type;

  for (var name in fields) {
    type = parseType(reg, fields[name]);
    result.push({ name: name, type: type });
  }

  return result;
}

function parseType(reg, field) {
  if (typeof field == 'function')
    field = typeName(field);

  if (!field)
    throw new Error('empty field');
  else if (field instanceof Array)
    return { type: 'array', items: reg.type(field[0]).__schema__ };
  else if (typeof field == 'string')
    return reg.type(field).__schema__;

  throw new Error('Bad field spec: ' + JSON.stringify(field));
};

var ALIAS = { 'String': 'string', 'Number': 'double', 'Boolean': 'boolean' };

function typeName(fn) {
  var name = U.functionName(fn);
  return ALIAS[name] || name;
}


// ## Builtin ##

var BUILTIN = {};

function addBuiltins(reg) {
  for (var name in BUILTIN) {
    reg.type(BUILTIN[name]);
  }
  return reg;
}

function defBuiltin(schema) {

}