'use strict';

this.EXPORTED_SYMBOLS = ['elementTypes', 'elementTypeMaskMap', 'parseDomains', 'parseOptions', 'parseHTMLFilter', 'parseFilter', 'parse', 'matchesFilter', 'matches'];
var elementTypes = {
  SCRIPT: 1,
  IMAGE: 2,
  STYLESHEET: 4,
  OBJECT: 8,
  XMLHTTPREQUEST: 16,
  OBJECTSUBREQUEST: 32,
  SUBDOCUMENT: 64,
  DOCUMENT: 128,
  OTHER: 256
};

var elementTypeMaskMap = new Map([['script', elementTypes.SCRIPT], ['image', elementTypes.IMAGE], ['stylesheet', elementTypes.STYLESHEET], ['object', elementTypes.OBJECT], ['xmlhttprequest', elementTypes.XMLHTTPREQUEST], ['object-subrequest', elementTypes.OBJECTSUBREQUEST], ['subdocument', elementTypes.SUBDOCUMENT], ['document', elementTypes.DOCUMENT], ['other', elementTypes.OTHER]]);

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
      var optionWithoutPrefix = option[0] === '~' ? option.substring(1) : option;
      if (elementTypeMaskMap.has(optionWithoutPrefix)) {
        if (option[0] === '~') {
          output.skipElementTypeMask |= elementTypeMaskMap.get(optionWithoutPrefix);
        } else {
          output.elementTypeMask |= elementTypeMaskMap.get(optionWithoutPrefix);
        }
      }
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

  var c = testHost[testHost.length - baseContextHost.length - 1];
  return c !== '.' && c !== undefined;
}

// Determines if there's a match based on the options, this doesn't
// mean that the filter rule shoudl be accepted, just that the filter rule
// should be considered given the current context.
// By specifying context params, you can filter out the number of rules which are
// considered.
function matchOptions(parsedFilterData, input) {
  var contextParams = arguments[2] === undefined ? {} : arguments[2];
  var cachedInputData = arguments[3] === undefined ? {} : arguments[3];

  if (contextParams.elementTypeMask !== undefined && parsedFilterData.options) {
    if (parsedFilterData.options.elementTypeMask !== undefined && !(parsedFilterData.options.elementTypeMask & contextParams.elementTypeMask)) {
      return false;
    }if (parsedFilterData.options.skipElementTypeMask !== undefined && parsedFilterData.options.skipElementTypeMask & contextParams.elementTypeMask) {
      return false;
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
  var cachedInputData = arguments[3] === undefined ? {} : arguments[3];

  if (!matchOptions(parsedFilterData, input, contextParams, cachedInputData)) {
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
    if (!cachedInputData.host) {
      cachedInputData.host = getUrlHost(input);
    }

    return !isThirdPartyHost(parsedFilterData.host, cachedInputData.host) && indexOfFilter(input, parsedFilterData.data) !== -1;
  }

  // Wildcard match comparison
  var parts = parsedFilterData.data.split('*');
  var index = 0;
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = parts[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var part = _step.value;

      var newIndex = indexOfFilter(input, part, index);
      if (newIndex === -1) {
        return false;
      }
      index = newIndex + part.length;
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

  return true;
}

var maxCached = 100;
function matches(parserData, input) {
  var contextParams = arguments[2] === undefined ? {} : arguments[2];
  var cachedInputData = arguments[3] === undefined ? {} : arguments[3];

  cachedInputData.misses = cachedInputData.misses || new Set();
  cachedInputData.missList = cachedInputData.missList || [];
  if (cachedInputData.missList.length > maxCached) {
    cachedInputData.misses['delete'](cachedInputData.missList[0]);
    cachedInputData.missList = cachedInputData.missList.splice(1);
  }
  if (cachedInputData.misses.has(input)) {
    return false;
  }

  if (parserData.filters.some(function (parsedFilterData) {
    return matchesFilter(parsedFilterData, input, contextParams, cachedInputData);
  })) {
    // Check for exceptions only when there's a match because matches are
    // rare compared to the volume of checks
    return !parserData.exceptionFilters.some(function (parsedFilterData) {
      return matchesFilter(parsedFilterData, input, contextParams, cachedInputData);
    });
  }

  cachedInputData.missList.push(input);
  cachedInputData.misses.add(input);
  return false;
}
this.elementTypes = elementTypes;
this.elementTypeMaskMap = elementTypeMaskMap;
this.parseDomains = parseDomains;
this.parseOptions = parseOptions;
this.parseHTMLFilter = parseHTMLFilter;
this.parseFilter = parseFilter;
this.parse = parse;
this.matchesFilter = matchesFilter;
this.matches = matches;

//# sourceMappingURL=abp-filter-parser.jsm.map