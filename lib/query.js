exports.Query = Query;


// ## Query ##

function Query(store) {
  this.store = store;
  this.filter(function() { return true; });
}

Query.prototype.filter = function(fn) {
  var prev = this._filter;
  if (!this.prev)
    this._filter = fn;
  else
    this._filter = function() {
      return prev.apply(this, arguments) && fn.apply(this, arguments);
    };
  return this;
};

Query.prototype.each = function(done, fn) {
  var filter = this._filter;

  this.store.each(done, function(obj) {
    if (filter(obj))
      fn.call(this, obj);
  });

  return this;
};

Query.prototype.all = function(done) {
  var result = [];

  this.each(finished, function(obj) {
    result.push(obj);
  });

  function finished(err) {
    err ? done(err) : done(null, result);
  }

  return this;
};

Query.prototype.one = function(done) {
  var found;

  this.each(finished, function(obj) {
    found = obj;
    this.stop();
  });

  function finished(err) {
    done(err, found);
  }

  return this;
};
