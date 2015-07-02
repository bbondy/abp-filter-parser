export const elementTypes = {
  SCRIPT: 0o1,
  IMAGE: 0o2,
  STYLESHEET: 0o4,
  OBJECT: 0o10,
  XMLHTTPREQUEST: 0o20,
  OBJECTSUBREQUEST: 0o40,
  SUBDOCUMENT: 0o100,
  DOCUMENT: 0o200,
  OTHER: 0o400,
};

export const elementTypeMaskMap = new Map([
  ['script', elementTypes.SCRIPT],
  ['image', elementTypes.IMAGE],
  ['stylesheet', elementTypes.STYLESHEET],
  ['object', elementTypes.OBJECT],
  ['xmlhttprequest', elementTypes.XMLHTTPREQUEST],
  ['object-subrequest', elementTypes.OBJECTSUBREQUEST],
  ['subdocument', elementTypes.SUBDOCUMENT],
  ['document', elementTypes.DOCUMENT],
  ['other', elementTypes.OTHER]
]);

const separatorCharacters = ':?/=^';

/**
 * Parses the domain string using the passed in separator and
 * fills in options.
 */
export function parseDomains(input, separator, options) {
  options.domains = options.domains || [];
  options.skipDomains = options.skipDomains || [];
  let domains = input.split(separator);
  options.domains = options.domains.concat(domains.filter((domain) => domain[0] !== '~'));
  options.skipDomains = options.skipDomains.concat(domains
    .filter((domain) => domain[0] === '~')
    .map((domain) => domain.substring(1)));
}

/**
 * Parses options from the passed in input string
 */
export function parseOptions(input) {
  let output = {
    binaryOptions: new Set(),
  };
  input.split(',').forEach((option) => {
    option = option.trim();
    if (option.startsWith('domain=')) {
      let domainString = option.split('=')[1].trim();
      parseDomains(domainString, '|', output);
    } else {
      let optionWithoutPrefix = option[0] === '~' ? option.substring(1) : option;
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
  for (let i = startPos; i < input.length; i++) {
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
export function parseHTMLFilter(input, index, parsedFilterData) {
  let domainsStr = input.substring(0, index);
  parsedFilterData.options = {};
  if (domainsStr.length > 0) {
    parseDomains(domainsStr, ',', parsedFilterData.options)
  }

  // The XOR parsedFilterData.elementHidingException is in case the rule already
  // was specified as exception handling with a prefixed @@
  parsedFilterData.isException = !!(input[index + 1] === '@' ^
    parsedFilterData.isException);
  if (input[index + 1] === '@') {
    // Skip passed the first # since @# is 2 chars same as ##
    index++;
  }
  parsedFilterData.htmlRuleSelector = input.substring(index + 2);
}

export function parseFilter(input, parsedFilterData) {
  input = input.trim();

  // Check for comment or nothing
  if (input.length === 0) {
    return false;
  }

  // Check for comments
  let beginIndex = 0;
  if (input[beginIndex] === '[' || input[beginIndex] === '!') {
    parsedFilterData.isComment = true;
    return false;
  }

  // Check for exception instead of filter
  parsedFilterData.isException = input[beginIndex] === '@' &&
    input[beginIndex + 1] === '@';
  if (parsedFilterData.isException) {
    beginIndex = 2;
  }

  // Check for element hiding rules
  let index = input.indexOf('#', beginIndex);
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
  parsedFilterData.isRegex = input[beginIndex] === '/' &&
    input[input.length - 1] === '/' && beginIndex !== input.length - 1;
  if (parsedFilterData.isRegex) {
    parsedFilterData.data = input.slice(beginIndex + 1, -1);
    return true;
  }

  // Check if there's some kind of anchoring
  if (input[beginIndex] === '|') {
    // Check for an anchored domain name
    if (input[beginIndex + 1] === '|') {
      parsedFilterData.hostAnchored = true;
      let indexOfSep = findFirstSeparatorChar(input, beginIndex + 1);
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

export function parse(input, parserData) {
  parserData.filters = parserData.filters || [];
  parserData.exceptionFilters = parserData.exceptionFilters  || [];
  parserData.htmlRuleFilters = parserData.htmlRuleFilters || [];
  let startPos = 0;
  let endPos = input.length;
  let newline = '\n';
  while (startPos <= input.length) {
    endPos = input.indexOf(newline, startPos);
    if (endPos === -1) {
      newline = '\r';
      endPos = input.indexOf(newline, startPos);
    }
    if (endPos === -1) {
      endPos = input.length;
    }
    let filter = input.substring(startPos, endPos);
    let parsedFilterData = {};
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
  let index = input.indexOf(':');
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

  let filterParts = filter.split('^');
  let index = startingPos;
  let beginIndex = -1;
  let prefixedSeparatorChar = false;

  for (let f = 0; f < filterParts.length; f++) {
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
  let domainIndexStart = getDomainIndex(input);
  let domainIndexEnd = findFirstSeparatorChar(input, domainIndexStart);
  if (domainIndexEnd === -1) {
    domainIndexEnd = input.length;
  }
  return input.substring(domainIndexStart, domainIndexEnd);
}

function filterDataContainsOption(parsedFilterData, option) {
  return parsedFilterData.options &&
    parsedFilterData.options.binaryOptions &&
    parsedFilterData.options.binaryOptions.has(option);
}

function isThirdPartyHost(baseContextHost, testHost) {
  if (!testHost.endsWith(baseContextHost)) {
    return true;
  }

  let c = testHost[testHost.length - baseContextHost.length - 1]
  return c !== '.' && c !== undefined;
}

// Determines if there's a match based on the options, this doesn't
// mean that the filter rule shoudl be accepted, just that the filter rule
// should be considered given the current context.
// By specifying context params, you can filter out the number of rules which are
// considered.
function matchOptions(parsedFilterData, input, contextParams = {}, cachedInputData = {}) {
  if (contextParams.elementTypeMask !== undefined && parsedFilterData.options) {
    if (parsedFilterData.options.elementTypeMask !== undefined &&
        !(parsedFilterData.options.elementTypeMask & contextParams.elementTypeMask)) {
      return false;
    } if (parsedFilterData.options.skipElementTypeMask !== undefined &&
          parsedFilterData.options.skipElementTypeMask & contextParams.elementTypeMask) {
      return false;
    }
  }

  // Domain option check
  if (contextParams.domain !== undefined && parsedFilterData.options) {
    if (parsedFilterData.options.domains || parsedFilterData.options.skipDomains) {
      // Get the domains that should be considered
      let shouldBlockDomains = parsedFilterData.options.domains.filter((domain) =>
        !isThirdPartyHost(domain, contextParams.domain));

      let shouldSkipDomains = parsedFilterData.options.skipDomains.filter((domain) =>
        !isThirdPartyHost(domain, contextParams.domain));
      // Handle cases like: example.com|~foo.example.com should llow for foo.example.com
      // But ~example.com|foo.example.com should block for foo.example.com
      let leftOverBlocking = shouldBlockDomains.filter((shouldBlockDomain) =>
        shouldSkipDomains.every((shouldSkipDomain) =>
          isThirdPartyHost(shouldBlockDomain, shouldSkipDomain)));
      let leftOverSkipping = shouldSkipDomains.filter((shouldSkipDomain) =>
        shouldBlockDomains.every((shouldBlockDomain) =>
          isThirdPartyHost(shouldSkipDomain, shouldBlockDomain)));

      // If we have none left over, then we shouldn't consider this a match
      if (shouldBlockDomains.length === 0 && parsedFilterData.options.domains.length !== 0 ||
          shouldBlockDomains.length > 0 && leftOverBlocking.length === 0 ||
          shouldSkipDomains.length > 0 && leftOverSkipping.length > 0) {
        return false;
      }
    }
  }

  // If we're in the context of third-party site, then consider third-party option checks
  if (contextParams['third-party'] !== undefined) {
    // Is the current rule check for third party only?
    if (filterDataContainsOption(parsedFilterData, 'third-party')) {
      let inputHost = getUrlHost(input);
      let inputHostIsThirdParty = isThirdPartyHost(parsedFilterData.host, inputHost);
      if (inputHostIsThirdParty || !contextParams['third-party']) {
        return false;
      }
    }
  }

  return true;
}

export function matchesFilter(parsedFilterData, input, contextParams = {}, cachedInputData = {}) {
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

    return !isThirdPartyHost(parsedFilterData.host, cachedInputData.host) &&
      indexOfFilter(input, parsedFilterData.data) !== -1;
  }

  // Wildcard match comparison
  let parts = parsedFilterData.data.split('*');
  let index = 0;
  for (let part of parts) {
    let newIndex = indexOfFilter(input, part, index);
    if (newIndex === -1) {
      return false;
    }
    index = newIndex + part.length;
  }

  return true;
}

export function matches(parserData, input, contextParams = {}) {
  let cachedInputData = {};
  if (parserData.filters.some((parsedFilterData) =>
    matchesFilter(parsedFilterData, input, contextParams, cachedInputData))) {
    // Check for exceptions only when there's a match because matches are
    // rare compared to the volume of checks
    return !parserData.exceptionFilters.some((parsedFilterData) =>
      matchesFilter(parsedFilterData, input, contextParams, cachedInputData));
  }

  return false;
}
