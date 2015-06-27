import assert from 'assert';
import {parseOptions} from '../abp-filter-parser.js';

// Maps options string to [blockDomains, skipDomains]
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
  it('rule types should be properly detected', function() {
    domainOptionStrings.forEach(([domains, skipDomains], optionsString) => {
      let options = parseOptions(optionsString);
      assert.equal(options.domains.length, domains.length);
      for (var i = 0; i < options.domains.length; i++) {
        assert.equal(options.domains[i], domains[i]);
      }
      assert.equal(options.skipDomains.length, skipDomains.length);
      for (var i = 0; i < options.skipDomains.length; i++) {
        assert.equal(options.skipDomains[i], skipDomains[i]);
      }
    });
  });
});
