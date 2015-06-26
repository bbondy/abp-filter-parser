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

const separatorCharacters = ':?/=^';

function findFirstSeparatorChar(input, startPos) {
  for (let i = startPos; i < input.length; i++) {
    if (separatorCharacters.indexOf(input[i]) !== -1) {
      return i;
    }
  }
  return -1;
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
      parsedFilterData.elementHiding = input.substring(beginIndex + index + 2);
      parsedFilterData.elementHidingException = input[beginIndex + index + 1] === '@';
    }
  }

  // Check for options, regex can have options too so check this before regex
  index = input.indexOf('$', beginIndex);
  if (index !== -1) {
    parsedFilterData.options = input.substring(beginIndex + index + 1).split(',');
    // Get rid of the trailing options for the rest of the parsing
    input = input.substring(0, index);
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

export function parse(input) {
  let parserData = {
    filterCount: 0,
    filters: [],
    exceptionFilters: [],
  };

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
      if (parsedFilterData.isException) {
        parserData.exceptionFilters.push(parsedFilterData);
      } else {
        parserData.filters.push(parsedFilterData);
      }
      parserData.filterCount++;
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
    parsedFilterData.options.includes(option);
}

function isThirdPartyHost(baseContextHost, testHost) {
  if (!testHost.endsWith(baseContextHost)) {
    return true;
  }

  let prefix = testHost.slice(0, -baseContextHost.length);
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
function matchOptions(parsedFilterData, input, contextParams = {}) {

  // Lazilly fill this out to be more efficient
  // Element type checks
  let elementTypeParams = ['script', 'image', 'stylesheet', 'object',
   'xmlhttprequest', 'object-subrequest', 'subdocument', 'document', 'other'];
  for (let elementType of elementTypeParams) {
    // Check for script context
    if (contextParams[elementType] !== undefined) {
      if (!contextParams[elementType] && filterDataContainsOption(parsedFilterData, elementType)) {
        return false;
      }
      else if (contextParams[elementType] && filterDataContainsOption(parsedFilterData, '~' + elementType)) {
        return false;
      }
    }
  }

  // Domain option check
  if (contextParams.domain !== undefined && parsedFilterData.options) {
    let domainOption = parsedFilterData.options.find((parsedFilter) =>
      parsedFilter.startsWith('domain'));
    if (domainOption) {
      let domains = domainOption.split('=')[1].trim().split('|');
      let shouldSkipDomainCheck = domains.some((domain) => domain[0] === '~' &&
        isThirdPartyHost(domain.substring(1), contextParams.domain));

      // Get the domains that should be considered
      let potentialShouldBlockDomains = domains.filter((domain) => domain[0] !== '~');
      let shouldBlockDomains = potentialShouldBlockDomains.filter((domain) =>
        !isThirdPartyHost(domain, contextParams.domain));

      let potentialShouldSkipDomains = domains.filter((domain) => domain[0] === '~');
      let shouldSkipDomains = potentialShouldSkipDomains.filter((domain) =>
        !isThirdPartyHost(domain.substring(1), contextParams.domain));
      // Handle cases like: example.com|~foo.example.com should llow for foo.example.com
      // But ~example.com|foo.example.com should block for foo.example.com
      let leftOverBlocking = shouldBlockDomains.filter((shouldBlockDomain) =>
        shouldSkipDomains.every((shouldSkipDomain) =>
          isThirdPartyHost(
            shouldBlockDomain,
            shouldSkipDomain.substring(1)
            )));
      let leftOverSkipping = shouldSkipDomains.filter((shouldSkipDomain) =>
        shouldBlockDomains.every((shouldBlockDomain) =>
          isThirdPartyHost(
            shouldSkipDomain.substring(1),
            shouldBlockDomain
            )));

      // If we have none left over, then we shouldn't consider this a match
      if (shouldBlockDomains.length === 0 && potentialShouldBlockDomains.length !== 0 ||
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

export function matchesFilter(parsedFilterData, input, contextParams = {}) {
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
    let inputHost = getUrlHost(input);
    let matchIndex = inputHost.lastIndexOf(parsedFilterData.host);
    return (matchIndex === 0 || inputHost[matchIndex - 1] === '.') &&
      inputHost.length <= matchIndex + parsedFilterData.host.length &&
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
  if (parserData.exceptionFilters.some((parsedFilterData) =>
      matchesFilter(parsedFilterData, input, contextParams))) {
    return false;
  }

  return parserData.filters.some((parsedFilterData) =>
    matchesFilter(parsedFilterData, input, contextParams));
}
