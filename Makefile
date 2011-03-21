all:
	node-waf configure build

tests:
	expresso test-avro/*.js -s test/kyoto.js test/model.js test/validation.js