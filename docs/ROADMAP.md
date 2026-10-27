# Development roadmap

This is a proposed delivery plan, not a statement of implemented behavior.
Safety-relevant control remains unavailable until the shared runtime contracts
and production access policy are approved.

## Phase 1: production baseline

- Define Factory AP, Field Ethernet, and service-access network profiles,
  including bind addresses, firewall rules, DNS/hostnames, and recovery access.
- Provide and test a supported TLS reverse-proxy configuration with explicit
  allowed origins; keep the Python backend unreachable from untrusted clients.
- Define operator and maintainer roles, session limits, password recovery,
  audit events, release/rollback procedure, and a production-readiness checklist.
- Add install/upgrade tests covering interactive and unattended DEB flows,
  active/stopped services, credential preservation, and rollback.

Exit criteria: approved threat model and access matrix; encrypted browser
traffic; reproducible install, upgrade, rollback, and recovery checks.

## Phase 2: safe Settings

- Inventory settings and classify them as read-only, runtime-safe, restart
  required, or factory-only. Define ownership, units, ranges, defaults, and
  model applicability.
- Expose a versioned settings schema through the shared core API. Support
  validation, optimistic concurrency, preview/diff, atomic writes, rollback,
  and an audit record. Do not edit runtime files directly from the browser.
- Implement role-based UI sections and explicit confirmation for disruptive
  changes. Keep secrets write-only.

Exit criteria: approved schema and migration policy; invalid or stale updates
are rejected; power-loss and rollback behavior is tested on target hardware.

## Phase 3: control ownership and non-hazardous motion

- Add shared Communication Layer support for independent `WEB_UI` registration,
  backend and browser heartbeat, an exclusive owner lease, and explicit release.
- Keep connection, liveness, ownership, enable state, and command acknowledgement
  as separate states. Never acquire ownership on page load.
- Add bounded command rate, dead-man behavior, neutral-on-timeout, model limits,
  server-side validation, and command/audit telemetry.
- Integrate only non-hazardous motion after hardware-in-the-loop fault tests.

Exit criteria: conflicting owners are rejected; disconnect and timeout always
return commands to neutral; ownership and command results are observable.

## Phase 4: video and extended tools

- Introduce a browser-compatible video gateway and a verified per-model
  camera/profile map, with bounded resource use and failure reporting.
- Integrate tool status before adding tool commands. Each command needs an
  explicit runtime contract, authorization rule, acknowledgement, timeout,
  interlock, and hardware test.
- Keep fire and safety activation outside this Web UI unless a separate safety
  assessment and product decision explicitly changes that boundary.

Exit criteria: model-specific contracts are versioned; degraded video cannot
affect control; every enabled tool action has tested interlocks and audit data.
