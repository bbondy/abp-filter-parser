import assert from 'assert';
import {parse, parseFilter, matches, matchesFilter} from '../abp-filter-parser.js';
import fs from 'fs';

let testRules = new Map([
  ['/banner/*/img', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '/banner/*/img',
    blocked: [
      'http://example.com/banner/foo/img',
      'http://example.com/banner/foo/bar/img?param',
      'http://example.com/banner//img/foo',
      'http://example.com/banner//img.gif',
    ],
    notBlocked: [
      'http://example.com/banner/',
      'http://example.com/banner/img',
      'http://example.com/img/banner/',
    ]
  }],
  ['/banner/*/img^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '/banner/*/img^',
    blocked: [
      'http://example.com/banner/foo/img',
      'http://example.com/banner/foo/bar/img?param',
      'http://example.com/banner//img/foo',
    ],
    notBlocked: [
      'http://example.com/banner/img',
      'http://example.com/banner/foo/imgraph',
      'http://example.com/banner/foo/img.gif',
    ]
  }],
  ['||ads.example.com^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: true,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'ads.example.com^',
    blocked: [
      'http://ads.example.com/foo.gif',
      'http://server1.ads.example.com/foo.gif',
      'https://ads.example.com:8000/',
    ],
    notBlocked: [
      'http://ads.example.com.ua/foo.gif',
      'http://example.com/redirect/http://ads.example.com/',
    ],
  }],
  ['|http://example.com/|', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: true,
    rightAnchored: true,
    options: undefined,
    data: 'http://example.com/',
    blocked: [
      'http://example.com/'
    ],
    notBlocked: [
      'http://example.com/foo.gif',
      'http://example.info/redirect/http://example.com/',
    ],
  }],
  ['swf|', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: true,
    options: undefined,
    data: 'swf',
    blocked: [
      'http://example.com/annoyingflash.swf',
    ],
    notBlocked: [
      'http://example.com/swf/index.html'
    ],
  }],
  ['|http://baddomain.example/', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: true,
    rightAnchored: undefined,
    options: undefined,
    data: 'http://baddomain.example/',
    blocked: [
     'http://baddomain.example/banner.gif',
    ],
    notBlocked: [
      'http://gooddomain.example/analyze?http://baddomain.example',
    ],
  }],
  ['||example.com/banner.gif', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: true,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'example.com/banner.gif',
    blocked: [
      'http://example.com/banner.gif',
      'https://example.com/banner.gif',
      'http://www.example.com/banner.gif',
    ],
    notBlocked: [
      'http://badexample.com/banner.gif',
      'http://gooddomain.example/analyze?http://example.com/banner.gif',
      'http://example.com.au/banner.gif',
      'http://example.com/banner2.gif',
    ],
  }],
  ['http://example.com^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'http://example.com^',
    blocked: [
      'http://example.com/',
      'http://example.com:8000/ ',
    ],
    notBlocked: [],
  }],
  ['^example.com^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '^example.com^',
    blocked: [
      'http://example.com:8000/foo.bar?a=12&b=%D1%82%D0%B5%D1%81%D1%82',
    ],
    notBlocked: [],
  }],
  ['^%D1%82%D0%B5%D1%81%D1%82^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '^%D1%82%D0%B5%D1%81%D1%82^',
    blocked: [
      'http://example.com:8000/foo.bar?a=12&b=%D1%82%D0%B5%D1%81%D1%82',
    ],
    notBlocked: [
      'http://example.com:8000/foo.bar?a=12&b%D1%82%D0%B5%D1%81%D1%823',
    ],
  }],
  ['^foo.bar^', {
    isRegex: false,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: '^foo.bar^',
    blocked: [
      'http://example.com:8000/foo.bar?a=12&b=%D1%82%D0%B5%D1%81%D1%82'
    ],
    notBlocked: [
    ],
  }],
  ['/banner\\d+/', {
    isRegex: true,
    isException: false,
    elementHiding: undefined,
    elementHidingException: undefined,
    hostAnchored: undefined,
    leftAnchored: undefined,
    rightAnchored: undefined,
    options: undefined,
    data: 'banner\\d+',
    blocked: [
      'banner123',
      'testbanner1',
    ],
    notBlocked: [
      'banners',
      'banners123',
    ],
  }],
]);

let exceptionRules = new Map([
  [`adv
    @@advice.`, {
    blocked: [
      'http://example.com/advert.html',
    ],
    notBlocked: [
      'http://example.com/advice.html',
    ]
  }],
  [`@@advice.
    adv`, {
      blocked: [
        'http://example.com/advert.html'
      ],
      notBlocked: [
        'http://example.com/advice.html'
      ],
  }],
  [`@@|http://example.com
    @@advice.
    adv
    !foo`, {
     blocked: [
       'http://examples.com/advert.html',
     ],
     notBlocked: [
       'http://example.com/advice.html',
       'http://example.com/advert.html',
       'http://examples.com/advice.html',
       'http://examples.com/#!foo',
     ],
  }],
]);

// Map from a key with a ABP filter rule to a set of [testUrl, context params, should block?]
let optionRules = new Map([
  ['||example.com', new Set([
    ['http://example.com', {'third-party': true}, true],
    ['http://example2.com', {'third-party': true}, false],
    ['http://example.com', {'third-party': false}, true],
  ])], ['||example.com^$third-party', new Set([
    ['http://example.com', {'third-party': true}, true],
    ['http://example.com', {'third-party': false}, false],
    ['http://ad.example.com', {'third-party': true}, true],
    ['http://ad.example.com', {'third-party': false}, false],
    ['http://example2.com', {'third-party': true}, false],
    ['http://example2.com', {'third-party': false}, false],
    ['http://example.com.au', {'third-party': true}, false],
    ['http://example.com.au', {'third-party': false}, false],
  ])], ['||example.com^$third-party,~script', new Set([
    ['http://example.com', {'third-party': true, 'script': true}, false],
    ['http://example.com', {'third-party': true, 'script': false}, true],
    ['http://example2.com', {'third-party': true, 'script': false}, false],
    ['http://example.com', {'third-party': false, 'script': false}, false],
  ])], ['adv$domain=example.com|example.net', new Set([
    ['http://example.net/adv', {'domain': 'example.net'}, true],
    ['http://somewebsite.com/adv', {'domain': 'example.com'}, true],
    ['http://www.example.net/adv', {'domain': 'www.example.net'}, true],
    ['http://my.subdomain.example.com/adv', {'domain': 'my.subdomain.example.com'}, true],
    ['http://example.com/adv', {'domain': 'badexample.com'}, false],
    ['http://example.com/adv', {'domain': 'otherdomain.net'}, false],
    ['http://example.net/ad', {'domain': 'example.net'}, false],
  ])], ['adv$domain=example.com|~foo.example.com', new Set([
    ['http://example.net/adv', {'domain': 'example.com'}, true],
    ['http://example.net/adv', {'domain': 'foo.example.com'}, false],
    ['http://example.net/adv', {'domain': 'www.foo.example.com'}, false],
  ])], ['adv$domain=~example.com|foo.example.com', new Set([
    ['http://example.net/adv', {'domain': 'example.com'}, false],
    ['http://example.net/adv', {'domain': 'foo.example.com'}, true],
    ['http://example.net/adv', {'domain': 'www.foo.example.com'}, true],
  ])],
]);


describe('#parseFilter()', function(){
  it('should extract proper parsing info for filter rules', function() {
    testRules.forEach((testRule, key) => {
      let parsedFilterData = {};
      parseFilter(key, parsedFilterData);
      for (let p in testRule) {
        if (!['blocked', 'notBlocked'].includes(p)) {
          assert.equal(testRule[p], parsedFilterData[p], `for property ${p}:
            ${testRule[p]} !== ${parsedFilterData[p]}`);
        }
      }
      for (let input of testRule.blocked) {
        assert(matchesFilter(parsedFilterData, input),
          `${key} should block ${input}`);
      }
      for (let input of testRule.notBlocked) {
        assert(!matchesFilter(parsedFilterData, input),
          `${key} should not block ${input}`);
      }
    });
  });

  it('Exception tests work correctly', function() {
    exceptionRules.forEach((testRule, key) => {
      let parserData = parse(key);
      for (let input of testRule.blocked) {
        assert(matches(parserData, input),
          `${key} should block ${input}`);
      }
      for (let input of testRule.notBlocked) {
        assert(!matches(parserData, input),
          `${key} should not block ${input}`);
      }
    });
  });

  it('Option and param context rules work correctly', function() {
    // Map from a key with a ABP filter rule to a set of [testUrl, context params, should block?]
    optionRules.forEach((setOfTests, filterRule) => {
      let parserData = parse(filterRule);
      setOfTests.forEach((testData) => {
        let [testUrl, contextParams, shouldBlock] = testData;
        assert.equal(matches(parserData, testUrl, contextParams), shouldBlock,
          `${filterRule} should ` + (shouldBlock ? 'block' : 'not block') + ` ${testUrl} ` +
          `with context params: ${JSON.stringify(contextParams)}`);
      });
    });
  });


});

describe('#parse()', function(){
  it('should parse EasyList without failing', function(cb){
    fs.readFile('./test/data/easylist.txt', 'utf8', function (err, data) {
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
