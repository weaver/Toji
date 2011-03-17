var Assert = require('assert'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Model = require('./model'),
    U = require('./util');


// ## Validation Interface ##

Model.Model.include({
  isValid: function(force) {
    if (force || (this.errors === undefined))
      Type.of(this).validateAll(this, this.errors = {});
    return U.isEmpty(this.errors);
  },

  validate: function() {
    console.warn('Model#validate() is deprecated, use Model#isValid() instead.');
    return this.isValid() ? null : this.errors;
  }
});


// ## Validation Errors ##

exports.Invalid = Avro.Invalid;
exports.isValidationError = isValidationError;
exports.invalidMessage = invalidMessage;

function isValidationError(err) {
  return (typeof err == 'string')
    || (err.name == 'Invalid')
    || (err.name == 'AssertionError');
}

function invalidMessage(err) {
  if (typeof err == 'string')
    return err;
  else if (err.name == 'Invalid')
    return err.reason || err.message;
  else if (err.name == 'AssertionError')
    return err.message;
  throw new Type.ValueError('cannot find invalid message for', err);
}


// ## Validators ##

Model.Model.extend({
  validatesPresenceOf: function(names) {
    return this.validatesEach(names, function(name) {
      this
        .validates(name, validatePresence)
        .modifyField(name, function(field) {
          if (Type.isSubclass(field.type, Avro.UnionType))
            field.changeType(field.type.without(null));
        });
    });
  }
});

function validatePresence(val, field) {
  Assert.ok(!U.isEmpty(val), 'expected non-empty value');
}


// ## Validation / Model Integration ##

var compile = Model.Model.compile;

Model.Model.extend({
  compile: function(reg, type) {
    compile.call(this, reg, type);
    this.validationHooks = {};
    return type;
  }
});

Model.Model.include({
  beforeSave: function(creating) {
    var type = Type.of(this);
    type.emit('beforeSave', this, creating);
    type.assertValidationHooks(this);
    return this;
  },

  afterSave: function(created) {
    Type.of(this)
      .emit('afterSave', created);
    return this;
  },

  afterLoad: function() {
    Type.of(this).emit('afterLoad', this);
    return this;
  },

  beforeRemove: function() {
    Type.of(this).emit('beforeRemove', this);
    return this;
  }
});


// ## Validation Definition Infrastructure ##

Model.Model.extend({
  validates: function(names, fn) {
    var hooks = this.validationHooks;

    if (U.isFunction(names))
      pushInto(hooks, '', names);
    else
      this.validatesEach(names, function(name) {
        pushInto(hooks, name, fn);
      });

    return this;
  },

  validatesEach: function(names, add) {
    var self = this;

    if (U.isArray(names))
      names.forEach(function(name) {
        add.call(self, name);
      });
    else
      add.call(this, names || '');

    return this;
  },

  eachValidationHook: function(fn) {
    var allHooks = this.validationHooks,
        i, l, field, hooks;

    for (var name in allHooks) {
      hooks = allHooks[name];
      field = this.field(name);
      for (i = 0, l = hooks.length; i < l; i++)
        fn.call(this, hooks[i], field);
    }

    return this;
  }
});


// ## Validation Execution ##

Model.Model.extend({
  assertValidationHooks: function(obj) {
    return this.eachValidationHook(function(hook, field) {
      try {
        hook.call(this, obj[field.name], field, obj);
      } catch (x) {
        if (isValidationError(x))
          throw new Avro.InvalidField(field, invalidMessage(x));
        else
          throw x;
      }
    });
  },

  validateAll: function(obj, errors) {
    if (this.validateSelf(obj, errors))
      this.validateFields(obj, this.validateHooks(obj, errors));
    return errors;
  },

  validateSelf: function(obj, errors) {
    try {
      this.assertValid(obj);
      return true;
    } catch (x) {
      if (!isValidationError(x))
        throw x;
      pushInto(errors, '', invalidMessage(x));
      return false;
    }
  },

  validateHooks: function(obj, errors) {
    this.eachValidationHook(function(hook, field) {
      try {
        hook.call(this, obj[field.name], field, obj);
      } catch (x) {
        if (isValidationError(x))
          pushInto(errors, field.name, invalidMessage(x));
        else
          throw x;
      }
    });

    return errors;
  },

  validateFields: function(obj, errors) {
    this.eachField(obj, function(val, name, field) {
      try {
        if (!(field.name in errors))
          field.validate(val);
      } catch (x) {
        if (isValidationError(x))
          pushInto(errors, name, invalidMessage(x));
        else
          throw x;
      }
    });

    return errors;
  }
});

function pushInto(obj, key, value) {
  if (!obj[key])
    obj[key] = [];
  obj[key].push(value);
  return obj;
}
