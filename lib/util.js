var Sys = require('sys');

exports.extend = extend;
exports.functionName = functionName;
exports.writeInt = writeInt;
exports.hex = hex;
exports.aEach = aEach;
exports.each = each;
exports.inherits = inherits;
exports.isEmpty = isEmpty;

function extend(target) {
  var obj, key;

  target = target || {};
  for (var i = 1, l = arguments.length; i < l; i++) {
    if ((obj = arguments[i])) {
      for (key in obj)
        target[key] = obj[key];
    }
  }

  return target;
}

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

function inherits(fn, base) {
  Sys.inherits(fn, base);
  return extend(fn, base);
}

function each(obj, fn) {
  for (var key in obj) {
    fn(obj[key], key);
  }
  return obj;
}

function isEmpty(obj) {
  if (!obj) return true;

  for (var _ in obj)
    return false;

  return true;
}