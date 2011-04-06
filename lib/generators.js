exports.each = each;
exports.collect = collect;
exports.TakeWhile = TakeWhile;
exports.Filter = Filter;
exports.AMap = AMap;
exports.Sort = Sort;


// ## Each ##

function each(iter, fn) {
  var error;

  iter.next(step);

  function step() {
    try {
      fn.apply(this, arguments);
    } catch (x) {
      error = x;
    }
    error ? iter.done(error) : iter.next(step);
  }

  return iter;
};

function collect(iter, seed) {
  if (seed instanceof Array)
    function record(obj) {
      seed.push(obj);
    }
  else
    function record(val, key) {
      seed[key] = val;
    }

  var done;
  iter.then(function(next) {
    done = next;
    return finished;
  });

  each(iter, record);

  function finished(err) {
    err ? done(err) : done(null, seed);
  }

  return this;
};


// ## TakeWhile ##

function TakeWhile(iter, predicate) {
  this.iter = iter;
  this.predicate = predicate;
  this.stopped = false;
}

TakeWhile.prototype.then = function(callback) {
  this.iter.then(callback);
  return this;
};

TakeWhile.prototype.done = function(err) {
  this.iter.done(err);
  return this;
};

TakeWhile.prototype.next = function(fn) {
  var iter = this.iter,
      pred = this.predicate;

  if (this.stopped)
    iter.done();
  else
    iter.next(take);

  function take() {
    if (pred.apply(this, arguments))
      fn.apply(this, arguments);
    else {
      this.stopped = true;
      iter.done();
    }
  }

  return this;
};


// ## Filter ##

function Filter(iter, predicate) {
  this.iter = iter;
  this.predicate = predicate;
}

Filter.prototype.then = function(callback) {
  this.iter.then(callback);
  return this;
};

Filter.prototype.done = function(err) {
  this.iter.done(err);
  return this;
};

Filter.prototype.next = function(fn) {
  var iter = this.iter,
      pred = this.predicate;

  iter.next(find);

  function find() {
    pred.apply(this, arguments) ? fn.apply(this, arguments) : iter.next(find);
  }

  return this;
};


// ## AMap ##

function AMap(iter, map) {
  this.iter = iter;
  this.map = map;
}

AMap.prototype.then = function(callback) {
  this.iter.then(callback);
  return this;
};

AMap.prototype.done = function(err) {
  this.iter.done(err);
  return this;
};

AMap.prototype.next = function(fn) {
  var self = this,
      map = this.map;

  self.iter.next(function(obj) {
    map(obj, accept);
  });

  function accept(err, val) {
    err ? self.done(err) : fn(val);
  }

  return this;
};


// ## Sort ##

function Sort(iter, cmp) {
  this.iter = iter;
  this.cmp = cmp;

  this.resume = undefined;
  this.draining = false;

  var self = this;
  iter.then(function(done) {
    self._done = done;
    return function(err) {
      return self.done(err);
    };
  });
}

Sort.prototype.then = function(callback) {
  this._done = callback(this._done);
  return this;
};

Sort.prototype.done = function(err) {
  if (err || this.draining) {
    this._done(err);
  }
  else {
    this.drain();
  }
  return this;
};

Sort.prototype.next = function(fn) {
  if (!this.draining) {
    this.resume = fn;
    return this.buffer();
  }

  var self = this,
      iter = this.iter,
      buffer = this._buffer;

  if (buffer.length == 0) {
    this.iter.done();
  }
  else
    process.nextTick(function() {
      fn(buffer.shift());
    });

  return this;
};

Sort.prototype.buffer = function() {
  var iter = this.iter,
      buffer = this._buffer = [];

  iter.next(accumulate);

  function accumulate(obj) {
    buffer.push(obj);
    iter.next(accumulate);
  }

  return this;
};

Sort.prototype.drain = function() {
  this.draining = true;

  if (!this.resume) {
    this.iter.done();
    return this;
  }

  try {
    this._buffer.sort(this.cmp);
  } catch (x) {
    this.iter.done(x);
    return this;
  }

  this.next(this.resume);

  return this;
};
