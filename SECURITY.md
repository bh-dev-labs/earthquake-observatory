# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's
"Report a vulnerability" button on the repository's Security tab, rather than a
public issue. I aim to acknowledge reports within a week.

## Scope and design

The observatory is a local app: it listens on loopback only, rejects non-loopback
`Host` headers and cross-site requests, requires same-origin for state-changing
requests, and ships no secrets or API keys. The browser demo uses bundled sample
data only.
