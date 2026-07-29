# Velvet monitor

`@velvet/monitor` executes normalized Velvet HTTP checks. It uses Bun and
Node-compatible `http` and `https` primitives directly, forces IPv4 lookup,
follows redirects within the configured bound, and has no runtime dependency
on Upptime, Globalping, GitHub, or the presentation layer.

```ts
import { executeHttpCheck } from "@velvet/monitor";

const result = await executeHttpCheck(check);
```

The executor resolves configured header values by environment-variable name
before latency measurement starts. Secret values are sent only to the original
origin and same-origin redirects. Cross-origin redirects drop all configured
headers. Missing or invalid secret values produce redacted failures before a
request is created.

Status-only checks stop at the final response headers and never parse the body.
Explicit JSON assertions read at most 64 KiB and evaluate safe RFC 6901
pointers. Results contain the check identifier, completion time, outcome,
latency, final status code, and a stable redacted error. They never contain the
endpoint URL, connection details, secret names, or secret values.
