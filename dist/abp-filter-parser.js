define('abp-filter-parser', ['exports'], function (exports) {
  /*
  var filterOptions = new Set([
    // Include or exclude JavaScript files.
    'script',
    // Include or exclude image files.
    'image',
    // Include or exclude stylesheets (CSS files).
    'stylesheet',
    // Include or exclude content handled by browser plugins like Flash
    // or Java.
    'object',
    // Include or exclude files loaded by browser plugins.
    'object-subrequest',
    // Include or exclude pages loaded within pages (frames).
    'subdocument',
    // Used to whitelist the page itself (e.g. @@||example.com^$document).
    'document',
    // Used to prevent element rules from applying on a page
    // (e.g. @@||example.com^$elemhide).
    'elemhide',
    // Specify a list of domains, separated by bar lines (|), on which a
    // filter should be active. A filter may be prevented from being activated
    // on a domain by preceding the domain name with a tilde (~).
    'domain=',
    // Specify whether a filter should be active on third-party or first domains.
    'third-party',
  ]);
  */

  'use strict';

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.parseDomains = parseDomains;
  exports.parseOptions = parseOptions;
  exports.parseHTMLFilter = parseHTMLFilter;
  exports.parseFilter = parseFilter;
  exports.parse = parse;
  exports.matchesFilter = matchesFilter;
  exports.matches = matches;
  var separatorCharacters = ':?/=^';

  /**
   * Parses the domain string using the passed in separator and
   * fills in options.
   */

  function parseDomains(input, separator, options) {
    options.domains = options.domains || [];
    options.skipDomains = options.skipDomains || [];
    var domains = input.split(separator);
    options.domains = options.domains.concat(domains.filter(function (domain) {
      return domain[0] !== '~';
    }));
    options.skipDomains = options.skipDomains.concat(domains.filter(function (domain) {
      return domain[0] === '~';
    }).map(function (domain) {
      return domain.substring(1);
    }));
  }

  /**
   * Parses options from the passed in input string
   */

  function parseOptions(input) {
    var output = {
      binaryOptions: new Set()
    };
    input.split(',').forEach(function (option) {
      option = option.trim();
      if (option.startsWith('domain=')) {
        var domainString = option.split('=')[1].trim();
        parseDomains(domainString, '|', output);
      } else {
        output.binaryOptions.add(option);
      }
    });
    return output;
  }

  function findFirstSeparatorChar(input, startPos) {
    for (var i = startPos; i < input.length; i++) {
      if (separatorCharacters.indexOf(input[i]) !== -1) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Parses an HTML filter and modifies the passed in parsedFilterData
   * as necessary.
   *
   * @param input: The entire input string to consider
   * @param index: Index of the first hash
   * @param parsedFilterData: The parsedFilterData object to fill
   */

  function parseHTMLFilter(input, index, parsedFilterData) {
    var domainsStr = input.substring(0, index);
    parsedFilterData.options = {};
    if (domainsStr.length > 0) {
      parseDomains(domainsStr, ',', parsedFilterData.options);
    }

    // The XOR parsedFilterData.elementHidingException is in case the rule already
    // was specified as exception handling with a prefixed @@
    parsedFilterData.isException = !!(input[index + 1] === '@' ^ parsedFilterData.isException);
    if (input[index + 1] === '@') {
      // Skip passed the first # since @# is 2 chars same as ##
      index++;
    }
    parsedFilterData.htmlRuleSelector = input.substring(index + 2);
  }

  function parseFilter(input, parsedFilterData) {
    input = input.trim();

    // Check for comment or nothing
    if (input.length === 0) {
      return false;
    }

    // Check for comments
    var beginIndex = 0;
    if (input[beginIndex] === '[' || input[beginIndex] === '!') {
      parsedFilterData.isComment = true;
      return false;
    }

    // Check for exception instead of filter
    parsedFilterData.isException = input[beginIndex] === '@' && input[beginIndex + 1] === '@';
    if (parsedFilterData.isException) {
      beginIndex = 2;
    }

    // Check for element hiding rules
    var index = input.indexOf('#', beginIndex);
    if (index !== -1) {
      if (input[index + 1] === '#' || input[index + 1] === '@') {
        parseHTMLFilter(input.substring(beginIndex), index - beginIndex, parsedFilterData);
        // HTML rules cannot be combined with other parsing,
        // other than @@ exception marking.
        return true;
      }
    }

    // Check for options, regex can have options too so check this before regex
    index = input.indexOf('$', beginIndex);
    if (index !== -1) {
      parsedFilterData.options = parseOptions(input.substring(index + 1));
      // Get rid of the trailing options for the rest of the parsing
      input = input.substring(0, index);
    } else {
      parsedFilterData.options = {};
    }

    // Check for a regex
    parsedFilterData.isRegex = input[beginIndex] === '/' && input[input.length - 1] === '/' && beginIndex !== input.length - 1;
    if (parsedFilterData.isRegex) {
      parsedFilterData.data = input.slice(beginIndex + 1, -1);
      return true;
    }

    // Check if there's some kind of anchoring
    if (input[beginIndex] === '|') {
      // Check for an anchored domain name
      if (input[beginIndex + 1] === '|') {
        parsedFilterData.hostAnchored = true;
        var indexOfSep = findFirstSeparatorChar(input, beginIndex + 1);
        if (indexOfSep === -1) {
          indexOfSep = input.length;
        }
        beginIndex += 2;
        parsedFilterData.host = input.substring(beginIndex, indexOfSep);
      } else {
        parsedFilterData.leftAnchored = true;
        beginIndex++;
      }
    }
    if (input[input.length - 1] === '|') {
      parsedFilterData.rightAnchored = true;
      input = input.substring(0, input.length - 1);
    }

    parsedFilterData.data = input.substring(beginIndex) || '*';
    return true;
  }

  function parse(input, parserData) {
    parserData.filters = parserData.filters || [];
    parserData.exceptionFilters = parserData.exceptionFilters || [];
    parserData.htmlRuleFilters = parserData.htmlRuleFilters || [];
    var startPos = 0;
    var endPos = input.length;
    var newline = '\n';
    while (startPos <= input.length) {
      endPos = input.indexOf(newline, startPos);
      if (endPos === -1) {
        newline = '\r';
        endPos = input.indexOf(newline, startPos);
      }
      if (endPos === -1) {
        endPos = input.length;
      }
      var filter = input.substring(startPos, endPos);
      var parsedFilterData = {};
      if (parseFilter(filter, parsedFilterData)) {
        if (parsedFilterData.htmlRuleSelector) {
          parserData.htmlRuleFilters.push(parsedFilterData);
        } else if (parsedFilterData.isException) {
          parserData.exceptionFilters.push(parsedFilterData);
        } else {
          parserData.filters.push(parsedFilterData);
        }
      }
      startPos = endPos + 1;
    }
    return parserData;
  }

  function getDomainIndex(input) {
    var index = input.indexOf(':');
    ++index;
    while (input[index] === '/') {
      index++;
    }
    return index;
  }

  // Similar to str1.indexOf(filter, startingPos) but with
  // extra consideration to some ABP filter rules like ^
  function indexOfFilter(input, filter, startingPos) {
    if (filter.length > input.length) {
      return -1;
    }

    var filterParts = filter.split('^');
    var index = startingPos;
    var beginIndex = -1;
    var prefixedSeparatorChar = false;

    for (var f = 0; f < filterParts.length; f++) {
      if (filterParts[f] === '') {
        prefixedSeparatorChar = true;
        continue;
      }

      index = input.indexOf(filterParts[f], index);
      if (index === -1) {
        return -1;
      }
      if (beginIndex === -1) {
        beginIndex = index;
      }

      if (prefixedSeparatorChar) {
        if (separatorCharacters.indexOf(input[index - 1]) === -1) {
          return -1;
        }
      }
      // If we are in an in between filterPart
      if (f + 1 < filterParts.length &&
      // and we have some chars left in the input past the last filter match
      input.length > index + filterParts[f].length) {
        if (separatorCharacters.indexOf(input[index + filterParts[f].length]) === -1) {
          return -1;
        }
      }

      prefixedSeparatorChar = false;
    }
    return beginIndex;
  }

  function getUrlHost(input) {
    var domainIndexStart = getDomainIndex(input);
    var domainIndexEnd = findFirstSeparatorChar(input, domainIndexStart);
    if (domainIndexEnd === -1) {
      domainIndexEnd = input.length;
    }
    return input.substring(domainIndexStart, domainIndexEnd);
  }

  function filterDataContainsOption(parsedFilterData, option) {
    return parsedFilterData.options && parsedFilterData.options.binaryOptions && parsedFilterData.options.binaryOptions.has(option);
  }

  function isThirdPartyHost(baseContextHost, testHost) {
    if (!testHost.endsWith(baseContextHost)) {
      return true;
    }

    var prefix = testHost.slice(0, -baseContextHost.length);
    if (prefix.length > 0 && !prefix.endsWith('.')) {
      return true;
    }

    return false;
  }

  // Determines if there's a match based on the options, this doesn't
  // mean that the filter rule shoudl be accepted, just that the filter rule
  // should be considered given the current context.
  // By specifying context params, you can filter out the number of rules which are
  // considered.
  function matchOptions(parsedFilterData, input) {
    var contextParams = arguments[2] === undefined ? {} : arguments[2];

    // Lazilly fill this out to be more efficient
    // Element type checks
    var elementTypeParams = ['script', 'image', 'stylesheet', 'object', 'xmlhttprequest', 'object-subrequest', 'subdocument', 'document', 'other'];
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = elementTypeParams[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var elementType = _step.value;

        // Check for script context
        if (contextParams[elementType] !== undefined) {
          if (!contextParams[elementType] && filterDataContainsOption(parsedFilterData, elementType)) {
            return false;
          } else if (contextParams[elementType] && filterDataContainsOption(parsedFilterData, '~' + elementType)) {
            return false;
          }
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator['return']) {
          _iterator['return']();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    // Domain option check
    if (contextParams.domain !== undefined && parsedFilterData.options) {
      if (parsedFilterData.options.domains || parsedFilterData.options.skipDomains) {
        var _ret = (function () {
          // Get the domains that should be considered
          var shouldBlockDomains = parsedFilterData.options.domains.filter(function (domain) {
            return !isThirdPartyHost(domain, contextParams.domain);
          });

          var shouldSkipDomains = parsedFilterData.options.skipDomains.filter(function (domain) {
            return !isThirdPartyHost(domain, contextParams.domain);
          });
          // Handle cases like: example.com|~foo.example.com should llow for foo.example.com
          // But ~example.com|foo.example.com should block for foo.example.com
          var leftOverBlocking = shouldBlockDomains.filter(function (shouldBlockDomain) {
            return shouldSkipDomains.every(function (shouldSkipDomain) {
              return isThirdPartyHost(shouldBlockDomain, shouldSkipDomain);
            });
          });
          var leftOverSkipping = shouldSkipDomains.filter(function (shouldSkipDomain) {
            return shouldBlockDomains.every(function (shouldBlockDomain) {
              return isThirdPartyHost(shouldSkipDomain, shouldBlockDomain);
            });
          });

          // If we have none left over, then we shouldn't consider this a match
          if (shouldBlockDomains.length === 0 && parsedFilterData.options.domains.length !== 0 || shouldBlockDomains.length > 0 && leftOverBlocking.length === 0 || shouldSkipDomains.length > 0 && leftOverSkipping.length > 0) {
            return {
              v: false
            };
          }
        })();

        if (typeof _ret === 'object') return _ret.v;
      }
    }

    // If we're in the context of third-party site, then consider third-party option checks
    if (contextParams['third-party'] !== undefined) {
      // Is the current rule check for third party only?
      if (filterDataContainsOption(parsedFilterData, 'third-party')) {
        var inputHost = getUrlHost(input);
        var inputHostIsThirdParty = isThirdPartyHost(parsedFilterData.host, inputHost);
        if (inputHostIsThirdParty || !contextParams['third-party']) {
          return false;
        }
      }
    }

    return true;
  }

  function matchesFilter(parsedFilterData, input) {
    var contextParams = arguments[2] === undefined ? {} : arguments[2];

    if (!matchOptions(parsedFilterData, input, contextParams)) {
      return false;
    }

    // Check for a regex match
    if (parsedFilterData.isRegex) {
      if (!parsedFilterData.regex) {
        parsedFilterData.regex = new RegExp(parsedFilterData.data);
      }
      return parsedFilterData.regex.test(input);
    }

    // Check for both left and right anchored
    if (parsedFilterData.leftAnchored && parsedFilterData.rightAnchored) {
      return parsedFilterData.data === input;
    }

    // Check for right anchored
    if (parsedFilterData.rightAnchored) {
      return input.slice(-parsedFilterData.data.length) === parsedFilterData.data;
    }

    // Check for left anchored
    if (parsedFilterData.leftAnchored) {
      return input.substring(0, parsedFilterData.data.length) === parsedFilterData.data;
    }

    // Check for domain name anchored
    if (parsedFilterData.hostAnchored) {
      var inputHost = getUrlHost(input);
      var matchIndex = inputHost.lastIndexOf(parsedFilterData.host);
      return (matchIndex === 0 || inputHost[matchIndex - 1] === '.') && inputHost.length <= matchIndex + parsedFilterData.host.length && indexOfFilter(input, parsedFilterData.data) !== -1;
    }

    // Wildcard match comparison
    var parts = parsedFilterData.data.split('*');
    var index = 0;
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = parts[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var part = _step2.value;

        var newIndex = indexOfFilter(input, part, index);
        if (newIndex === -1) {
          return false;
        }
        index = newIndex + part.length;
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2['return']) {
          _iterator2['return']();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    return true;
  }

  function matches(parserData, input) {
    var contextParams = arguments[2] === undefined ? {} : arguments[2];

    if (parserData.exceptionFilters.some(function (parsedFilterData) {
      return matchesFilter(parsedFilterData, input, contextParams);
    })) {
      return false;
    }

    return parserData.filters.some(function (parsedFilterData) {
      return matchesFilter(parsedFilterData, input, contextParams);
    });
  }
});

//# sourceMappingURL=abp-filter-parser.js.map