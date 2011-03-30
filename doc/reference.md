# Toji Reference #

Toji is a data mapper that uses [Avro][1] to store documents with
[Kyoto Cabinet][2].

## Synopsis ##

This example demonstrates how to define a model, open a Toji database,
and store a document:

    var Toji = require('Toji');

    var Person = Toji.type('Person', {
      name: String,
      email: String
    });

    Toji.open('/tmp/demo', function(err) {
      if (err) throw err;

      var chuck = new Person({
        name: 'Chuck Norris',
        email: 'fan@chucknorris.com'
      });

      chuck.save(function(err) {
        if (err) throw err;
        console.log('Saved', chuck);
      });

    });

## Types ##

Define types to structure and find documents. A type has a name and a
set of fields.

### Defining Types ###

**Toji.type(name)**

Lookup a type by name. If the type doesn't exit, an `Error` is thrown.

    var Person = Toji.type('Person');

**Toji.type(name, fields)**

Create a new type called `name`. The `fields` object maps field names
to types. By default, field values are embedded into documents. Use
`Toji.ref()` to create a reference instead.

    var Item = Toji.type('Item', {
      quantity: 'int',
      what: String,
      price: Number
    });

    var Cart = Toji.type('Cart', {
      owner: Toji.ref(Person),
      items: [Item]
    });

Types can be referenced by constructor or by name. For example, using
`Date` or `'Date'` would work. The technique of referring to types by
name can be used to make self-referencial types. For example:

    var Comment = Toji.type('Comment', {
      date: Date,
      body: String,
      replies: ['Comment']
    });

### Fields ###

TODO: describe `Toji.field()`

### Primitive Types ###

Some primitive types are pre-defined. Toji maps Javascript primitive
types onto Avro primitive types. Some Avro types (e.g. `int`) must be
refered to by name since Javascript doesn't have a corresponding
primitive.

+ `'boolean'` or `Boolean`
+ `'double'` or `Number`
+ `'string'` or `String`
+ `'float'`
+ `'int'`
+ `'long'`

### Builtin Types ###

Besides primitive types, Toji provides some additional standard types.

**Date**

The `Date` type is a standard in Javascript, but it doesn't have a
JSON or Avro representation. Toji handles this transparently by
mapping dates to strings using the `new Date()` constructor and
`.toString()`.

**Toji.ObjectId**

This special type may be used once in a model definition. It declares
that a certain field is the "primary key" for a model. The value of
the field should be a string. If it's not given, Toji creates a
virtual property called `id`.

    var User = Toji.type('User', {
      email: Toji.ObjectId,
      password: String
    });

    User.find('nobody@example.net', function(err, user) {
      ...
    });

**Toji.ref(type)**

Normally all fields values are embedded into a Toji document. Use
`Toji.ref()` to declare that a field should be a reference. The `type`
argument should be a Toji type.

    var Account = Toji.type('Account', {
      name: String,
      friends: [Toji.ref(Account)]
    });

    Account.find({ name: 'some-account-name' })
      .include('friends')
      .all(function(err, acct) {
        if (err) throw err;
	console.log('Friends of "%s": %j', acct.name, acct.friends);
      });

**Toji.union(type, ...)**

Allow a field to accept multiple types.

    var Box = Toji.type('Box', {
      value: Toji.union(User, Account);
    });

### Compound Types ###

Toji supports embedded data.

**[type]**

A field can hold an array of values. Declare this with an array
literal containing a single type.

    var Item = Toji.type('Item', {
      tags: [String]
    });

**{ field: type, ...}**

Declare an anonymous, embedded type using an object literal with field
declarations. For example, this:

    var Shape = Toji.type('Rectangle', {
      topLeft: { x: Number, y: Number },
      bottomRight: { x: Number, y: Number }
    });

is similar to:

    var Point = Toji.type('Rectange', {
      x: Number,
      y: NUmber
    });

    var Rectangle = Toji.type('Rectangle', {
      topLeft: Point,
      bottomRight: Point
    });

### Type Methods ###

### Instance Methods ###

## Queries ##

## Storage ##

[1]: http://avro.apache.org/docs/current/spec.html
[2]: http://fallabs.com/kyotocabinet/spex.html
