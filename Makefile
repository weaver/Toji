all:
	node-waf configure build

tests:
	expresso test-avro/*.js -s test/*