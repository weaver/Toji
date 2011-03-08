// # Type Registry #

var Type = require('./type'),
    Schema = require('./schema'),
    Primitive = require('./primitive'),
    Complex = require('./complex'),
    U = require('./util');

exports.Registry = Registry;


// ## Registry ##

// A registry is a collection of types. Types can be looked up by name
// or defined with a schema.

Type.create(Registry);
function Registry() {
  this.aliases = {};
  this.types = U.extend({}, Primitive.TYPES);
  this.complex = U.extend({}, Complex.TYPES);
}

Registry.include({
  toString: function() {
    return '#<Registry>';
  },

  exists: function(name) {
    return (this.get(name) !== undefined);
  },

  get: function(name) {
    return this.types[this.resolve(name)];
  },

  alias: function(name, schema) {
    this.aliases[name]= schema;
    return this;
  },

  resolve: function(name) {
    name = Schema.name(name);
    return this.aliases[name] || name;
  },

  define: function(base, schema) {
    if (schema === undefined) {
      schema = base;
      base = undefined;
    }

    var name = this.resolve(schema),
        type = this.get(name);

    if (type)
      return type;

    var kind = Schema.classify(schema),
        typeClass = this.complex[kind];

    if (!typeClass)
      throw new Schema.BadSchema('no typeclass for `' + kind + '`', schema);

    return defineType(this, typeClass, name, base, schema);
  },

  def: function(name, type) {
    return (this.types[name] = type);
  },

  undef: function(name, type) {
    if (this.types[name] === type)
      delete this.types[name];
    else if (name in this.types)
      throw new NameError(name, "type doesn't match", type);
    return this;
  }
});

// New types are defined in two steps. The type is declared and added
// to the registry first. Then it's compiled. The compilation step is
// when the type's schema is processed. This allows types to be
// self-referencial.

function defineType(reg, typeClass, name, base, schema) {
  var type;

  if ((type = reg.get(name)))
    throw new NameError(name, 'cannot redefine type', schema);

  type = reg.def(name, typeClass.declare(name, base, schema));
  try {
     return type.compile(reg, type);
  } catch(x) {
    reg.undef(name, type);
    throw x;
  }
}


// ## Errors ##

var NameError = U.defError(function NameError(name, reason, obj) {
  return name + ', ' + reason + ': ' + JSON.stringify(obj);
});
