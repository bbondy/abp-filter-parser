import assert from 'assert';
import {parseFilter, parseOptions} from '../src/abp-filter-parser.js';

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
  ['domain=example.com', [
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

let parseOptionTests = new Map([
  ['domain=foo.bar', [
    undefined,
    undefined,
    undefined,
  ]], ['+Ads/$~stylesheet', [
    new Set(['~stylesheet']),
    undefined,
    undefined,
  ]], ['-advertising-$domain=~advertise.bingads.domain.com', [
    new Set(),
    [],
    ['advertise.bingads.domain.com'],
  ]], ['.se/?placement=$script,third-party', [
    new Set(['script', 'third-party']),
    undefined,
    undefined,
  ]], ['||tst.net^$object-subrequest,third-party,domain=domain1.com|domain5.com', [
    new Set(['object-subrequest', 'third-party']),
    ['domain1.com', 'domain5.com'],
    [],
  ]],
]);

describe('options#parseOptions()', function() {
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
  it('parseFilter for full rules properly extracts options', function() {
    parseOptionTests.forEach(([expectedOptions, domains, skipDomains], filterString) => {
      let parsedFilterOptions = {};
      parseFilter(filterString, parsedFilterOptions);
      assert.equal(JSON.stringify(parsedFilterOptions.options.binaryOptions), JSON.stringify(expectedOptions));
      assert.equal(JSON.stringify(parsedFilterOptions.options.domains), JSON.stringify(domains));
      assert.equal(JSON.stringify(parsedFilterOptions.options.skipDomains), JSON.stringify(skipDomains));
    });
  });
});
