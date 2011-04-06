var Sys = require('sys');

exports.extend = extend;
exports.pop = pop;
exports.mapObject = mapObject;
exports.isEmpty = isEmpty;
exports.isFunction = isFunction;
exports.isString = isString;
exports.isPlainObject = isPlainObject;
exports.isArray = isArray;
exports.isJSONValue = isJSONValue;
exports.isPrimitiveJSON = isPrimitiveJSON;
exports.isNullish = isNullish;
exports.defError = defError;

function extend(target) {
  var obj, key, limit;

  if (isArray(target)) {
    for (var i = 1, l = arguments.length; i < l; i++) {
      if ((obj = arguments[i])) {
        for (key = 0, limit = obj.length; key < limit; key++)
          target.push(obj[key]);
      }
    }
  }
  else {
    target = target || {};
    for (var i = 1, l = arguments.length; i < l; i++) {
      if ((obj = arguments[i])) {
        for (key in obj)
          target[key] = obj[key];
      }
    }
  }

  return target;
}

function pop(obj, name, value) {
  if (name in obj) {
    value = obj[name];
    delete obj[name];
  }
  return value;
}

function mapObject(obj, fn) {
  var result = {};

  for (var key in obj) {
    result[key] = fn(obj[key], key);
  }

  return result;
}

function isNullish(obj) {
  return (obj === undefined) || (obj === null);
}

function isEmpty(obj) {
  switch(typeof obj) {
  case 'number':
  case 'boolean':
    return false;

  case 'object':
    for (var _ in obj)
      return false;
    return true;

  default:
    return !obj;
  }
}

function isJSONValue(obj) {
  switch(typeof obj) {
  case 'object':
    return (obj === null)
      || (obj.constructor === Object)
      || (obj.constructor === Array);

  case 'string':
  case 'number':
  case 'boolean':
    return true;

  default:
    return false;
  }
}

function isPrimitiveJSON(obj) {
  switch(typeof obj) {
  case 'object':
    return (obj === null);

  case 'string':
  case 'number':
  case 'boolean':
    return true;

  default:
    return false;
  }
}

function isPlainObject(obj) {
  return !!obj && (typeof obj == 'object') && (obj.constructor === Object);
}

function isArray(obj) {
  return obj instanceof Array;
}

function isFunction(obj) {
  return (typeof obj == 'function');
}

function isString(obj) {
  return (typeof obj == 'string');
}

function defError(message) {
  Sys.inherits(DefError, Error);
  function DefError() {
    Error.call(this);
    this.name = message.name;
    this.message = message.apply(this, arguments);
    Error.captureStackTrace(this, arguments.callee);
  }

  return DefError;
}