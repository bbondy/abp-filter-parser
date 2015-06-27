import assert from 'assert';
import {parseOptions} from '../abp-filter-parser.js';

// Maps option strings to [set of binary options, domains, skipDomains]
let splitOptions = new Map([
  ['subdocument,third-party', [
    new Set(['subdocument', 'third-party']),
    undefined,
    undefined,
  ]], ['object-subrequest,script,domain=~msnbc.msn.com|~www.nbcnews.com', [
    new Set(['object-subrequest', 'script']),
    [],
    ['msnbc.msn.com', 'www.nbcnews.com']
  ]], ['object-subrequest,script,domain=~msnbc.msn.com|~www.nbcnews.com', [
    new Set(['object-subrequest', 'script']),
    [],
    ['msnbc.msn.com', 'www.nbcnews.com']
  ]], ['~document,xbl,domain=~foo|bar|baz,~collapse,domain=foo.xbl|bar', [
    new Set(['~document', 'xbl', '~collapse']),
    ['bar', 'baz', 'foo.xbl', 'bar'],
    ['foo']
  ]], ['domain=~example.com|foo.example.com,script', [
    new Set(['script']),
    ['foo.example.com'],
    ['example.com']
  ]],
]);

// Maps option strings to [domains, skipDomains]
let domainOptionStrings = new Map([
  ['domain=example.com',[
    ['example.com'],
    []
  ]], ['domain=example.com|example.net', [
    ['example.com', 'example.net'],
    []
  ]], ['domain=~example.com', [
    [],
    ['example.com'],
  ]], ['domain=example.com|~foo.example.com', [
    ['example.com'],
    ['foo.example.com']
  ]], ['domain=~foo.example.com|example.com', [
    ['example.com'],
    ['foo.example.com'],
  ]],
  ['domain=example.com|example.net', [
    ['example.com', 'example.net'],
    [],
  ]],
  ['domain=example.com|~foo.example.com', [
    ['example.com'],
    ['foo.example.com'],
  ]],
  ['domain=~msnbc.msn.com|~www.nbcnews.com', [
    [],
    ['msnbc.msn.com', 'www.nbcnews.com'],
  ]],
]);

describe('#parseOptions()', function() {
  it('Option parsing should split options properly', function() {
    splitOptions.forEach(([expectedOptions, domains, skipDomains], optionsString) => {
      let options = parseOptions(optionsString);
      assert.equal(JSON.stringify(options.binaryOptions), JSON.stringify(expectedOptions));
      assert.equal(JSON.stringify(options.domains), JSON.stringify(domains));
      assert.equal(JSON.stringify(options.skipDomains), JSON.stringify(skipDomains));
    });
  });
  it('domain rule types should be properly parsed', function() {
    domainOptionStrings.forEach(([domains, skipDomains], optionsString) => {
      let options = parseOptions(optionsString);
      assert.equal(JSON.stringify(options.domains), JSON.stringify(domains));
      assert.equal(JSON.stringify(options.skipDomains), JSON.stringify(skipDomains));
    });
  });
});
