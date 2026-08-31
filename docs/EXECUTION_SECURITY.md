# PairPad Code Execution Security

PairPad never treats the application server as a safe place to execute arbitrary user code in production.

## Execution order

1. **Judge0** is the preferred production execution backend for the full language matrix.
2. An **isolated execution worker** can handle JavaScript/Python when `EXECUTION_WORKER_URL` and `EXECUTION_WORKER_TOKEN` are configured.
3. The legacy in-process runner is a development fallback only and must remain disabled in production.

## Isolated worker controls

Each worker job is launched as a disposable Docker container with:

- `--network none`
- memory limit
- CPU limit
- PID limit
- read-only root filesystem
- all Linux capabilities dropped
- `no-new-privileges`
- non-root runtime UID inside the execution container
- bounded stdout/stderr
- wall-clock timeout
- ephemeral workspace cleaned after execution

The worker itself is an infrastructure component. For production, run it on a dedicated execution host or managed sandbox service rather than granting the main API host Docker control.

## Docker socket warning

The development Compose example mounts `/var/run/docker.sock` into the worker so it can launch disposable execution containers. Docker socket access is highly privileged: compromise of that worker can become host-level compromise. Do **not** treat this Compose layout as a hardened multi-tenant production deployment.

For production use either Judge0/self-hosted sandboxing or a dedicated isolated worker host with a rootless/remote container runtime and a restricted control channel.

## Resource policy

Recommended defaults:

- source: 512 KB
- output: 1 MB
- execution: 5 seconds
- memory: 128 MB
- CPU: 0.5 core
- PIDs: 64
- worker request timeout: 7 seconds

Tighten these for public deployments according to workload and abuse testing.
