exports.extend = extend;
exports.functionName = functionName;

// Extend a target object with more attributes.
//
// This method accepts a variable number of Object arguments. The
// (key, value) pairs from each are set on the target in order. For
// example:
//
//     extend({}, {a: 1, b: 2}, {b: 3, c: 4})
//     ==> {a: 1, b: 3, c: 4}
//
// Returns target.
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