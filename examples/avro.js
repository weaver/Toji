var Assert = require('assert'),
    Avro = require('../lib/avro/index');

var Person = Avro.type({
  name: 'Person',
  type: 'record',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' }
  ]
});

var obj, data;

obj = { name: 'Douglas Crockford', email: 'douglas@crockford.com' };

console.log('As object:', new Person(obj));
console.log('Dumped:', data = Avro.dumpJSON(new Person(obj)));
console.log('Loaded:', Avro.loadJSON(Person, data));

var Related = Avro.type({
  name: 'Related',
  type: 'record',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'words', type: {
      type: 'map', values: {
        type: 'array', items: 'string' }
      }
    }
  ]
});

obj = { title: 'synonyms', words: {
  'desk': ['counter', 'stand', 'bench'],
  'bench': ['board', 'shelf', 'desk']
}};

console.log('From object:', new Related(obj));
console.log('Dumped:', data = Avro.dumpJSON(new Related(obj)));
console.log('Loaded:', Avro.loadJSON(Related, data));

var Choose = Avro.type({
  name: 'Choose',
  type: 'record',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'description', type: [null, 'string'] },
    { name: 'choice', type: [Person, Related, null] }
  ]
});

obj = {
  title: 'Hello, world',
  description: 'frob',
  choice: new Related(obj)
};

console.log('Unioned', new Choose(obj));
console.log('Unioned dump:', data = Avro.dumpJSON(new Choose(obj)));
console.log('Unioned load:', Avro.loadJSON(Choose, data));
console.log('Loaded choice', Avro.loadJSON(Choose, data).choice.toString());
console.log('Unioned export:', data = (new Choose(obj)).exportJSON());