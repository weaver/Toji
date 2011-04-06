var Sys = require('sys'),
    U = require('./avro/util');

U.extend(exports, U);
exports.functionName = functionName;
exports.writeInt = writeInt;
exports.hex = hex;
exports.encode32 = encode32;
exports.aEach = aEach;
exports.each = each;
exports.inherits = inherits;
exports.inArray = inArray;
exports.toArray = toArray;
exports.setHidden = setHidden;
exports.escapeRegExp = escapeRegExp;
exports.startsWith = startsWith;

function functionName(fn) {
  var text, probe;

  if ((probe = fn && fn.name))
    return probe;

  text = fn && fn.toString(),
  probe = text.match(/^function\s*([^\(]+)\(/);

  return probe ? probe[1] : '';
}

function writeInt(n, buf, offset, len) {
  for (var i = offset + len - 1; i >= offset; i--) {
    buf[i] = n & 0x0ff;
    n = n >> 8;
  }
}

var HEX = '0123456789abcdef';
function hex(buf) {
  var result = '';

  for (var i = 0, l = buf.length; i < l; i++) {
    result += HEX.charAt(buf[i] >> 4);
    result += HEX.charAt(buf[i] & 0x0f);
  }

  return result;
}

// http://www.crockford.com/wrmg/base32.html
var ENC32 = '0123456789abcdefghjkmnpqrstvwxyz';
function encode32(str, truncate) {
  var limit = truncate || Math.ceil(str.length * 8 / 5),
      result = new Array(limit),
      data = 0,
      bits = 0;

  for (var c = 0, b = 0, l = str.length; b < limit; b++, bits -= 5, data >>= 5) {
    if (bits < 5 && c < l) {
      data |= (str.charCodeAt(c++) << bits);
      bits += 8;
    }
    result[b] = ENC32.charAt(data & 0x1f);
  }

  return result.join('');
}

function aEach(seq, next, fn) {
  var index = 0, limit, list;

  if (typeof seq.length == 'number') {
    list = seq;
    limit = list.length;
    each();
  }
  else {
    list = Object.keys(seq);
    limit = list.length;
    eachItem();
  }

  function each(err) {
    if (err || (index >= limit))
      next(err);
    else
      fn(list[index++], index, each);
  }

  function eachItem(err) {
    if (err || (index >= limit))
      next(err);
    else {
      var key = list[index++];
      fn(seq[key], key, eachItem);
    }
  }
}

// Based on Node's util.inherits()
function inherits(ctor, base) {
  // Static superclass methods.
  ctor.super_ = base;

  ctor.prototype = Object.create(base.prototype, {
    constructor: { value: ctor, enumerable: false },
    // instance superclass methods.
    super_: { value: base.prototype, enumerable: false }
  });

  // Pull in static attributes
  return U.extend(ctor, base);
}

function each(obj, fn) {
  for (var key in obj) {
    fn(obj[key], key);
  }
  return obj;
}

function inArray(item, seq) {
  if (seq)
    for (var i = 0, l = seq.length; i < l; i++) {
      if (item === seq[i])
        return true;
    }
  return false;
}

function toArray(seq, offset) {
  offset = offset || 0;

  var limit = seq.length,
      result = new Array(limit - offset);

  for (var i = offset; i < limit; i++)
    result[i - offset] = seq[i];

  return result;
}

function setHidden(obj, name, val) {
  if (!(name in obj))
    Object.defineProperty(obj, name, { value: val, enumerable: false });
  else
    obj[name] = val;
  return obj;
}

function escapeRegExp(pattern) {
  return pattern.replace(/[\\\^\$\*\+\?\.\(\)\:\=\!\|\{\}\,\[\]]/g, '\\$&');
}

function startsWith(a, b) {
  return a.lastIndexOf(b, 0) === 0;
}