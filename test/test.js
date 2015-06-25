import assert from 'assert';
import {parse, parseFilter, matchesFilter} from '../abp-filter-parser.js';
import fs from 'fs';

var testRules = new Map([
  ['/banner/*/img^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '/banner/*/img*',
  }],
  ['||ads.example.com^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: true,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'ads.example.com*',
  }],
  ['|http://example.com/|', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: true,
    rightAnchored: true,
    options: undefined,
    data: 'http://example.com/',
  }],
  ['swf|', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: undefined,
    rightAnchored: true,
    options: undefined,
    data: 'swf',
  }],
  ['|http://baddomain.example/', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: true,
    rightAnchored: undefined,
    options: undefined,
    data: 'http://baddomain.example/',
  }],
  ["||example.com/banner.gif", {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: true,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'example.com/banner.gif',
  }],
  ['http://example.com^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'http://example.com*',
  }],
  ['^example.com^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '*example.com*',
  }],
  ['^%D1%82%D0%B5%D1%81%D1%82^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '*%D1%82%D0%B5%D1%81%D1%82*',
  }],
  ['^foo.bar^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    domainNameAnchor: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '*foo.bar*',
  }],
]);

describe('#parseFilter()', function(){
  it('should extract proper parsing info for filter rules', function(){
    testRules.forEach((testRule, key) => {
      let parsedFilterData = {};
      parseFilter(key, parsedFilterData);
      for (let p in testRule) {
        assert.equal(testRule[p], parsedFilterData[p], `for property ${p}`);
      }
    });
  });
});

describe('#parse()', function(){
  it('should parse EasyList without failing', function(cb){
    fs.readFile('./test/data/easylist.txt', 'utf8', function (err,data) {
      if (err) {
        return console.log(err);
      }
      let parserData = parse(data);
      // Num lines minus (num empty lines + num comment lines)
      assert.equal(parserData.filterCount, 47536);
      cb();
    });
  });
});
