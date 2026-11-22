# Security Policy

## Supported versions

Only the latest release and `main` are supported.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue.

Include what you found, how to reproduce it, and what it exposes. You can expect an acknowledgement within 72 hours.

## Scope that matters most here

Pastewise promises that pasted text is processed on the device and that the cloud only sees the empty form. A way to make pasted text reach a cloud request without the explicit consent step is a vulnerability, as is a way to bypass the acceptance gate so an unsupported value is shown as accepted.

No secrets live in this repository. The Firebase web config is public by design and is protected by App Check; if you find a real credential in the history, report it the same way.
