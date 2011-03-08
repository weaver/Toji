// # Primitive Types #

var Schema = require('./schema'),
    U = require('./util');

exports.TYPES = {};

function defPrim(name, methods) {
  return (exports.TYPES[name] = Schema.createType(name))
    .extend({
      isValid: isValidPrim,
      validate: assertValidPrim,
      loadJSON: assertValidPrim,
      dumpJSON: assertValidPrim,
      exportJSON: assertValidPrim
    })
    .extend(methods);
}

function isValidPrim(data) {
  return false;
}

function assertValidPrim(data) {
  if (!this.isValid(data))
    throw new Invalid('expected `' + this.__name__ + '`', data);
  return data;
}


// ## Type Definitions ##

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
    return isInteger(data) && inRange(data, MIN_INT, MAX_INT);
  }
});

defPrim('long', {
  isValid: function(data) {
    return isInteger(data) && inRange(data, MIN_LONG, MAX_LONG);
  }
});

defPrim('float', {
  isValid: function(data) {
    return isDecimal(data) && (isInf(data) || inRange(data, MIN_FLOAT, MAX_FLOAT));
  }
});

defPrim('double', {
  isValid: function(data) {
    return isDecimal(data) && (isInf(data) || inRange(data, MIN_DOUBLE, MAX_DOUBLE));
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


// ## Number Validation ##

// (12 % 1)   --> 0
// (1.2 % 1)  --> 0.1999...
// (pInf % 1) --> NaN
// (NaN % 1)  --> NaN
function isDecimal(n) {
  return typeof n == 'number';
}

function isInteger(n) {
  return (typeof n == 'number') && ((n % 1) == 0);
}

function isInf(n) {
  return (n === pInf) || (n === nInf);
}

function inRange(n, min, max) {
  return n >= min || n <= max;
}

var // 32-bit and 64-bit two's complement integers.
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


// ## Errors ##

var Invalid = U.defError(function Invalid(reason, obj) {
  return reason + ': ' + JSON.stringify(obj);
});
