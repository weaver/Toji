var Assert = require('assert'),
    Sys = require('sys'),
    U = require('./util');

exports.dump = dump;
exports.load = load;
exports.type = type;
exports.Registry = Registry;
exports.RecordType = RecordType;
exports.Invalid = Invalid;
exports.show = show;


// ## Serialization ##

function dump(obj) {
  var cls = obj.constructor;
  return JSON.stringify(cls.dump(obj));
}

function load(cls, data) {
  if (typeof data == 'string')
    data = JSON.parse(data);
  return cls.load(data);
}


// ## Registry ##

function Registry() {
  this.types = U.extend({}, PRIMITIVE);
  this.complex = U.extend({}, COMPLEX);
}

Registry.prototype.exists = function(name) {
  if (name && (typeof name != 'string'))
    name = name.name;
  return name in this.types;
};

Registry.prototype.get = function(name) {
  if (name && (typeof name != 'string'))
    name = name.name;
  return this.types[name];
};

Registry.prototype.name = function(schema) {
  return this.lookup(schema, function(exists, complex) {
    return exists ? exists.__name__ : complexName(complex, this, schema);
  });
};

Registry.prototype.type = function(schema) {
  return this.lookup(schema, function(exists, complex) {
    return exists || complexType(complex, this, schema);
  });
};

Registry.prototype.lookup = function(schema, fn) {
  var exists, kind, type;

  if (!schema)
    throw new Error('empty schema: ' + show(schema));
  else if ((exists = this.get(schema)))
    return fn.call(this, exists, null);

  kind = (schema instanceof Array) ? 'union' : (schema.type || schema);
  if ((type = this.complex[kind]))
    return fn.call(this, null, type);

  throw new Error('bad schema definition: ' + show(schema));
};


Registry.prototype.def = function(name, type) {
  return (this.types[name] = type);
};

Registry.prototype.undef = function(name, type) {
  if (this.types[name] === type)
    delete this.types[name];
  return this;
};


// ## Primitive Types ##

var PRIMITIVE = {},

    // 32-bit and 64-bit two's complement integers.
    MIN_INT = Math.pow(2, 31) - 1,
    MAX_INT = Math.pow(2, 31) * -1,
    MIN_LONG = Math.pow(2, 63) - 1,
    MAX_LONG = Math.pow(2, 63) * -1,

    // See "table of effective range" in
    // http://steve.hollasch.net/cgindex/coding/ieeefloat.html
    MIN_FLOAT = -1 * (2 - Math.pow(2, -23)) * Math.pow(2, 127),
    MAX_FLOAT = -1 * MIN_FLOAT,
    MIN_DOUBLE = -1 * (2 - Math.pow(2, -52)) * Math.pow(2, 1023),
    MAX_DOUBLE = -1 * MIN_FLOAT,
    pInf = Number.POSITIVE_INFINITY,
    nInf = Number.NEGATIVE_INFINITY;

function defPrim(name, methods) {
  return (PRIMITIVE[name] = U.extend({
    __name__: name,
    __schema__: name,
    isValid: isValidPrim,
    load: assertValidPrim,
    dump: assertValidPrim
  }, methods));
}

function isValidPrim(data) {
  return false;
}

function assertValidPrim(data) {
  if (!this.isValid(data))
    throw new Invalid('expected `' + this.__name__ + '`, not ' + show(data));
  return data;
}

defPrim('null', {
  isValid: function(data) {
    return data === null;
  }
});

defPrim('boolean', {
  isValid: function(data) {
    return typeof data == 'boolean';
  }
});

defPrim('int', {
  isValid: function(data) {
    return (
      typeof data == 'number'
      && isInteger(data)
      && data >= MIN_INT
      && data <= MAX_INT
    );
  }
});

defPrim('long', {
  isValid: function(data) {
    return (
      typeof data == 'number'
      && isInteger(data)
      && data >= MIN_LONG
      && data <= MAX_LONG
    );
  }
});

defPrim('float', {
  isValid: function(data) {
    return (
      typeof data == 'number' && isDecimal(data) && (
        data === pInf || data === nInf || (
          data >= MIN_FLOAT && data <= MAX_FLOAT
        )
    ));
  }
});

defPrim('double', {
  isValid: function(data) {
    return (
      typeof data == 'number' && isDecimal(data) && (
        data === pInf || data === nInf || (
          data >= MIN_DOUBLE && data <= MAX_DOUBLE
        )
    ));
  }
});

// TODO
// defPrim('bytes', {
// });

defPrim('string', {
  isValid: function(data) {
    return typeof data == 'string';
  }
});

// (12 % 1)   --> 0
// (1.2 % 1)  --> 0.1999...
// (pInf % 1) --> NaN
// (NaN % 1)  --> NaN
function isDecimal(n) {
  return (n === 0) || ((n % 1) != 0);
}

function isInteger(n) {
  return (n === 0) || !isDecimal(n);
}


// ## Complex Types ##

var COMPLEX = {};

function defComplex(name, type) {
  return (COMPLEX[name] = type);
}

function complexType(type, reg, schema) {
  var name = complexName(type, reg, schema), cls;

  if ((cls = reg.get(name)))
    return cls;

  cls = reg.def(name, type.declare(name, schema));
  try {
     return type.compile(reg, cls);
  } catch(x) {
    reg.undef(name, cls);
    throw x;
  }
}

function complexName(type, reg, schema) {
  return type.makeName(reg, schema);
}


// ## Record Type ##

defComplex('record', RecordType);
function RecordType(obj) {
  this.constructor.assertValid(obj);
  U.extend(this, obj);
}

RecordType.makeName = function(reg, schema) {
  var name = schema.name;
  if (!name)
    throw new Error('missing required `name` in ' + show(schema));
  return name;
};

RecordType.declare = function(name, schema) {
  var type = this;

  if (!schema.fields)
    throw new Error('missing required `fields` in ' + show(schema));

  Sys.inherits(Record, type);
  function Record() {
    return type.apply(this, arguments);
  }

  Record.__name__ = name;
  Record.__schema__ = schema;

  Record.isValid = this.isValid;
  Record.assertValid = this.assertValid;
  Record.load = this.load;
  Record.dump = this.dump;

  return Record;
};

RecordType.compile = function(reg, type) {
  var schema = type.__schema__,
      names = type.__fieldNames__ = {};

  type.__fields__ = schema.fields.map(function(field) {
    var f = Field.make(type, reg, field);
    if (f.__name__ in names)
      throw new Error('duplicate field name: ' + show(field));
    return (names[f.name] = f);
  });

  return type;
};

// Static Methods

RecordType.isValid = function(data) {
  return (typeof data == 'object');
};

RecordType.assertValid = function(data) {
  if (!this.isValid(data))
    throw new Invalid(this.__name__ + ': expected object, not ' + show(data));
  return data;
};

RecordType.load = function(data) {
  var type = this;

  type.assertValid(data);
  var obj = {};

  type.__fields__.forEach(function(field) {
    obj[field.name] = field.load(data[field.name]);
  });

  return new type(obj);
};

RecordType.dump = function(obj) {
  var type = this,
      data = {};

  type.assertValid(data);
  type.__fields__.forEach(function(field) {
    data[field.name] = field.dump(obj[field.name]);
  });

  return data;
};

// Instance Methods

RecordType.prototype.toString = function() {
  var type = this.constructor,
      name = type.__name__;
  return '#<' + name + ' ' + show(type.dump(this)) + '>';
};

function Field(record, name, schema, type) {
  this.record = record;
  this.name = name;
  this.schema = schema;
  this.type = type;
}

Field.make = function(record, reg, schema) {
  var name = schema.name;
  if (!name)
    throw new Error('missing required `name` in ' + show(schema));
  return new Field(record.__name__, name, schema, reg.type(schema.type));
};

Field.prototype.toString = function() {
  return '#<Field ' + this.record + '.' + this.name + '>';
};

Field.prototype.load = function(data) {
  try {
    if (data === undefined)
      data = this.schema['default'];
    return this.type.load(data);
  } catch (x) {
    if (x instanceof InvalidField)
      throw x;
    throw new InvalidField(this + ': ' + (x.message || x));
  }
};

Field.prototype.dump = function(obj) {
  try {
    return this.type.dump(obj);
  } catch (x) {
    if (x instanceof InvalidField)
      throw x;
    throw new InvalidField(this + ': ' + (x.message || x));
  }
};


// ## Array Type ##

defComplex('array', ArrayType);
function ArrayType(obj) {
  throw new Error("ArrayTypes aren't constructable.");
}

ArrayType.makeName = function(reg, schema) {
  var items = schema.items;
  if (!items)
    throw new Error('missing required `items` in ' + show(schema));
  return 'array<' + reg.name(items) + '>';
};

ArrayType.declare = function(name, schema) {
  var type = this;

  Sys.inherits(Array, type);
  function Array() {
    return type.apply(this, arguments);
  }

  Array.__name__ = name;
  Array.__schema__ = schema;

  Array.isValid = this.isValid;
  Array.assertValid = this.assertValid;
  Array.load = this.load;
  Array.dump = this.dump;

  return Array;
};

ArrayType.compile = function(reg, type) {
  var schema = type.__schema__;
  type.__items__ = reg.type(schema.items);
  return type;
};

// Static Methods

ArrayType.isValid = function(data) {
  return (data instanceof Array);
};

ArrayType.assertValid = function(data) {
  if (!this.isValid(data))
    throw new Invalid(this.__name__ + ': expected Array, not ' + show(data));
  return data;
};

ArrayType.load = function(data) {
  var type = this,
      items = type.__items__;

  return type.assertValid(data).map(function(item) {
    return items.load(item);
  });
};

ArrayType.dump = function(obj) {
  var type = this,
      items = type.__items__;

  return type.assertValid(obj).map(function(item) {
    return items.dump(item);
  });
};



// ## Map Type ##

defComplex('map', MapType);
function MapType(obj) {
  throw new Error("MapTypes aren't constructable.");
}

MapType.makeName = function(reg, schema) {
  var values = schema.values;
  if (!values)
    throw new Error('missing required `values` in ' + show(schema));
  return 'map{' + reg.name(values) + '}';
};

MapType.declare = function(name, schema) {
  var type = this;

  Sys.inherits(Map, type);
  function Map() {
    return type.apply(this, arguments);
  }

  Map.__name__ = name;
  Map.__schema__ = schema;

  Map.isValid = this.isValid;
  Map.assertValid = this.assertValid;
  Map.load = this.load;
  Map.dump = this.dump;

  return Map;
};

MapType.compile = function(reg, type) {
  var schema = type.__schema__;
  type.__values__ = reg.type(schema.values);
  return type;
};

// Static Methods

MapType.isValid = function(data) {
  return (typeof data == 'object') && (data.constructor === Object);
};

MapType.assertValid = function(data) {
  if (!this.isValid(data))
    throw new Invalid(this.__name__ + ': expected Object, not ' + show(data));
  return data;
};

MapType.load = function(data) {
  var type = this,
      values = type.__values__,
      result = {};

  for (var key in data) {
    result[key] = values.load(data[key]);
  }

  return result;
};

MapType.dump = function(obj) {
  var type = this,
      values = type.__values__,
      result = {};

  for (var key in obj) {
    result[key] = values.dump(obj[key]);
  }

  return result;
};


// ## Helpers ##

var show = JSON.stringify;

Sys.inherits(Invalid, Error);
function Invalid(message) {
  Error.call(this);
  this.name = 'Invalid';
  this.message = message;
  Error.captureStackTrace(this, arguments.callee);
}

Sys.inherits(InvalidField, Error);
function InvalidField(message) {
  Error.call(this);
  this.name = 'InvalidField';
  this.message = message;
  Error.captureStackTrace(this, arguments.callee);
}


// ## Global Registry ##

var TYPES = new Registry();

function type(schema) {
  return TYPES.type(schema);
}
