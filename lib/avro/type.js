// # Type System #

var U = require('./util');

exports.create = create;
exports.inherits = inherits;
exports.isType = isType;
exports.isSubclass = isSubclass;
exports.isInstance = isInstance;
exports.name = name;
exports.of = of;
exports.nameOf = nameOf;
exports.base = base;
exports.baseOf = baseOf;
exports.ValueError = ValueError;


// ## Type ##

// A Type is a Class constructor.

function create(ctor, base) {
  return inherits(ctor, base || Base);
}


// ## Inheritance ##

// The inheritance model tries to stay emphasize Javascript
// prototypes. It adds a few things for convenience.

// Static attributes are copied from the base. A fresh prototype
// object is created and linked to the base prototype to bring in
// instance attributes.
//
// Some special properties are also available:
//
//   + `type.__base__`    static reference to the base
//   + `type.fn`          static alias for `type.prototype`
//   + `this.constructor` instance reference to the type

function inherits(type, base) {
  U.extend(type, base);
  type.__base__ = base;

  type.prototype = type.fn = chain(base, {
    constructor: type
  });

  return type;
};

function chain(base, attr) {
  var props = {};

  for (var name in attr)
    props[name] = { value: attr[name], enumerable: false };

  return Object.create(base.prototype, props);
};


// ## Base Class ##

// This typeclass is used to create the prototype of the Base
// class. It provides some default instance methods and a way to
// discern whether an object is a type or not. See [Introspection]
// below.

function Type() {
}

function Base() {}

Base.prototype = Base.fn = new Type();

Base.extend = function(attr) {
  U.extend(this, attr);
  if (this.extended)
    this.extended(attr);
  return this;
};

Base.include = function(attr) {
  U.extend(this.fn, U.isFunction(attr) ? attr.prototype : attr);
  if (this.included)
    this.included(attr);
  return this;
};


// ## Introspection ##

function isType(obj) {
  return typeof obj == 'function';
}

function assertType(obj) {
  if (!isType(obj))
    throw new ValueError('expected type, not', obj);
  return obj;
}

function isSubclass(a, b) {
  assertType(a);
  assertType(b);

  var probe = a;
  do {
    if (probe === b)
      return true;
  } while((probe = base(probe)));

  return false;
}

function isInstance(a, type) {
  assertType(type);
  return a instanceof type;
}

function name(type) {
  assertType(type);
  return type.__name__ || type.name;
}

function of(obj) {
  var type = obj.constructor;
  if (!type)
    throw new ValueError('expected type instance', obj);
  return type;
}

function nameOf(obj) {
  return name(of(obj));
}

function base(type) {
  assertType(type);
  return (type.__base__ || type.super_);
}

function baseOf(type) {
  return base(of(obj));
}


// ## Errors ##

var ValueError = U.defError(function ValueError(reason, obj) {
  return reason + ': ' + JSON.stringify(obj);
});
