# Security

Report vulnerabilities privately through [GitHub](https://github.com/chroth/bitpane-ui/security/advisories/new), not in public issues.

## Security model

Bitpane UI is secure by design: safe by default, with any exception an explicit choice by the page that uses it.

**The library guarantees**
- **No HTML or code from strings.** Text is drawn as bitmaps, with a `textContent` copy for screen readers. Nothing uses `innerHTML`, `eval`, `new Function` or similar, and a test fails the build if they appear. Pages using Bitpane UI can enforce a strict Content Security Policy with Trusted Types (`require-trusted-types-for 'script'`); the tests run under one.
- **Safe links by default.** Text-window links, push buttons with an `href`, alert link buttons and application icons accept only `http:`, `https:`, `mailto:` and relative URLs. Any other scheme, such as `javascript:` or `data:`, throws unless `dangerouslyAllowSchemes` next to that `href` lists it. URLs are parsed the way the browser parses them, so case, whitespace and control characters cannot disguise a scheme. Links in text windows open with `noopener noreferrer`.
- **Checked input.** Arguments are typed, and what types cannot promise (text length, sizes, URLs, icon art) is checked at runtime, throwing a clear error before anything changes on the page.
- **Modal means modal.** While an alert is open, everything else is `inert`: it cannot be clicked, focused or reached with the keyboard.
- **No ambient access.** The library makes no network requests, uses no storage or cookies, and does not message other windows. Pictures load with `referrerPolicy="no-referrer"`.
- **No runtime dependencies.** Development dependencies are pinned to exact versions. CI installs them without lifecycle scripts, verifies registry signatures, pins GitHub Actions to commit SHAs and runs CodeQL.

**The page using it is responsible for**
- **Security headers.** The library cannot set them. Use a Content Security Policy, ideally with Trusted Types, and `frame-ancestors` to prevent framing.
- **Its own content.** Whatever the page puts into a window's `.content` is the page's code: build it with DOM methods and `textContent`, not HTML strings.
- **Any `dangerouslyAllowSchemes` it passes,** and where those URLs come from.
