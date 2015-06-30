# abp-filter-parser
JavaScript Adblock Plus filter parser for lists like EasyList

[![Build Status](https://travis-ci.org/bbondy/abp-filter-parser.svg?branch=master)](https://travis-ci.org/bbondy/abp-filter-parser)

Parses filter rules as per:
- https://adblockplus.org/en/filters
- https://adblockplus.org/en/filter-cheatsheet

## Usage

Babel / ES6:

```
import * as ABPFilterParser from 'js/ext/abp-filter-parser.js';
```

Node:

```
let ABPFilterParser = require('abp-filter-parser');
```

## Primary API:

```
let parsedFilterData = {};
ABPFilterParser.parse(easyListTxt, parsedFilterData);
ABPFilterParser.parse(someOtherListOfFilters, parsedFilterData);
...
if (ABPFilterParser.matches(this.parsedFilterData, urlToCheck, {
      domain: currentPageDomain,
    })) {
  console.log('should block this URL!');
} else {
  console.log('should NOT block this URL!');
}
```

## Secondary APIs

You probably won't need these directly, they are used by the parimary API above.

- parseDomains
- parseOptions
- parseHTMLFilter
- parseFilter
- matchesFilter
