# osekola.com — Vercel frontend and shared production VPS

Selected by the user on 2026-09-10. This configures the Phase 55 deployment target;
it does not assert that either application is live.

| Component | Selected target |
| --- | --- |
| Web frontend | Vercel project `osekola`, Next.js root directory `apps/web` |
| Main website | `https://osekola.com`; `www.osekola.com` redirects to the apex |
| Backend/API | `https://api.osekola.com` on the existing `riri-prod-01` VPS |
| API process | systemd `osekola-api`, separate Linux user/group `osekola` |
| API files | `/opt/osekola/releases/<source-sha>` and `/opt/osekola/current` |
| API Node runtime | `/opt/osekola/runtime/node/bin/node`, isolated Node.js 22.23.2 |
| API secrets | `/etc/osekola/api.env`, root-owned mode 0600 |
| API listener | `127.0.0.1:3020`, subject to a live port-availability check |
| Database/Auth | A separately configured production Supabase project |
| Public ingress | Existing Nginx, a separate `api.osekola.com` virtual host |

The server is the VPS computer running the backend processes. Vercel hosts the
school's frontend; Supabase hosts its database/Auth. RIRI and Emerald continue
using their own processes, directories, ports and configuration. Their recent
records identify `riri-api` and `riri-emerald-api`, with ports 8000/8010. The
operator supplied the live inspection below; the public IP remains unverified.

**Use this shared-VPS procedure for the selected target.** The generic
`compose.production.yml` from Phase 55 is a separate-host reference. Do not start
its Caddy ingress on this VPS: the existing Nginx owns ports 80/443. Build API
artifacts on CI/a build worker so dependency installation and compilation do not
compete with the trading processes. The API unit's initial CPU/memory ceilings
still need review against measured spare host capacity and school workload.

## 1. Inspect the existing VPS

Operator-provided output from the reviewed inspection script at **2026-09-10
13:22:16 UTC**, after [PR #51](https://github.com/rhieryayunin-gass/sekola/pull/51):

| Check | Observed result |
| --- | --- |
| Host | `riri-prod-01.asia-southeast2-a.c.riri-agent.internal` |
| Memory | 3910 MiB total; 2812 MiB available; no swap |
| Disk | 16G available; 45% used |
| Load average | 0.09 / 0.27 / 0.40 |
| Existing services | `riri-api`, `riri-emerald-api`, `nginx`: active |
| Existing API listeners | Loopback 8000 and 8010 |
| osekola listener | Port 3020 free at inspection time |
| Runtime | Node missing; Nginx 1.24.0; Certbot 2.9.0 |
| New app paths | `/opt/osekola`, `/etc/osekola`, osekola Nginx vhost absent |

This supports the isolated runtime installation and an initial API deployment
with the configured resource ceilings. It is a single snapshot, not peak-load
sizing or an application health check. The API is still undeployed. CPU count,
architecture and current public IP were not included in that output. Refresh
capacity and port checks immediately before starting the API.

In the established `rhiery86_ayunin@riri-prod-01` SSH session, run the reviewed
`ops/inspect-shared-vps.sh`. It prints hostname, capacity, runtime versions,
service state, listening TCP addresses and presence of the new project's paths.
It does not read environment files, dump Nginx config, install packages, reload
services or restart trading. Review the result before installing anything:

- Install the isolated runtime as described below. The API unit explicitly uses
  `/opt/osekola/runtime/node/bin/node`; a global `node` command is not required.
- Port 3020 must be free. If occupied, choose another unused port and update
  `api.env`, the Nginx upstream and probe commands together.
- Review CPU, available memory, swap/disk pressure and RIRI/Emerald health before
  reserving capacity. Initial osekola limits are 50% of one CPU and 768 MiB RAM;
  this is a ceiling, not a guarantee of spare capacity or application sizing.
- Existing `/opt/osekola`, `/etc/osekola` or `osekola-api` means this is an upgrade;
  inventory the existing release/configuration before making changes. A runtime
  directory alone can be the completed runtime-only installation below.

### Install the isolated Node runtime

Run the reviewed `ops/install-osekola-node.sh` using `sudo bash`. It downloads the
[official Node.js 22.23.2 Linux binary](https://nodejs.org/en/download/archive/v22.23.2)
for x64 or arm64 over HTTPS, checks the archive against the release's official
`SHASUMS256.txt`, validates the binary version, then installs it under
`/opt/osekola/runtime` with a `node` symlink. The installer requires curl, tar,
xz, sha256sum, flock and stat. It reports missing prerequisites without running
apt or changing a global runtime. There is no package compilation on the VPS.

```bash
sudo bash ops/install-osekola-node.sh
/opt/osekola/runtime/node/bin/node --version
```

Expected success: `OSEKOLA_NODE_READY` and `v22.23.2`. Re-running with this exact
runtime already installed succeeds without replacing it; conflicting directories
or another runtime cause an error for operator review. The script never starts,
stops or reloads services and does not create secrets, firewall rules or vhosts.
Updating Node later requires a separately reviewed version change and promotion.
Use the updated inspection script to report the isolated runtime, architecture
and CPU count, even though the shell's global `node` command can remain absent.

## 2. Prepare the Vercel project and DNS

Import `rhieryayunin-gass/sekola` as a separate Vercel project. Set Root Directory
to `apps/web`, framework Next.js, Node.js 22.x, and allow access to files outside
the root directory for the pnpm workspace and `deploy/vercel-build.mjs`.
`apps/web/vercel.json` supplies install/build commands; leave Output Directory at
the framework default. Do not deploy the NestJS backend as this frontend project.
See [Vercel monorepo configuration](https://vercel.com/docs/monorepos).

For **Production**, add the variables from `deploy/osekola/vercel.env.example`:
`NEXT_PUBLIC_API_URL=https://api.osekola.com`, the production Supabase URL, and
its publishable key (or legacy anon JWT in the publishable-key variable).
The service-role/secret key belongs only in the API environment. Configure
Preview separately with staging credentials and exact preview-origin CORS;
do not copy production credentials into every preview automatically.

Enable access to Vercel System Environment Variables. The build and `/healthz`
use `VERCEL_GIT_COMMIT_SHA` for release identity. Git-integrated deployments are
preferred; CLI builds must provide the full source `RELEASE_SHA` in both build
and runtime settings if Vercel Git metadata is absent. Never hardcode an old
release SHA in the Vercel project. See
[Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Add `osekola.com` and `www.osekola.com` to this Vercel project, with `www`
redirecting to `osekola.com`. At the current DNS provider, use the **exact DNS
records Vercel shows for this project**; do not guess a historical Vercel IP or
change nameservers/MX records. Add `api.osekola.com` pointing to the verified
current VPS public IP. Add an AAAA record only if IPv6 routing/listeners were
actually configured. See [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

Configure the production Supabase Auth Site URL as `https://osekola.com` and
explicitly allow the required redirect URLs. Production migrations through
`0059`, Auth email delivery, Storage and backup coverage need their own verified
production configuration; prior staging inspect/apply does not establish this.

## 3. Build the API release off-host

Use a clean Linux checkout of the reviewed source SHA with green CI, Node.js 22
and pnpm 11.21.0. Install using the frozen lockfile, then run:

```bash
bash ops/package-api.sh /tmp/osekola-api.tar.gz
```

Alternatively run **Package osekola API release** on `main` in GitHub Actions and
download its `osekola-api-<source-sha>` artifact. Verify that this exact source SHA
passed CI before promoting it. The archive includes built API code, production
dependencies and `release.env` containing only the source SHA. It contains no
Supabase credentials. Record the archive SHA-256 and transfer it to the VPS
through the existing authenticated SSH/SCP workflow. Verify the hash there.

## 4. Install the isolated API

After reviewing the preflight, create only the `osekola` Linux service account
and `/opt/osekola` plus `/etc/osekola` directories. Keep release directories
root-owned and readable/executable by the service account; make the secret
environment file root-owned mode 0600. systemd loads it before dropping to the
service user. Fill it from `deploy/osekola/api.env.example`. Do not print or paste
service-role keys into logs or chat.

Extract the verified archive into a **new, empty**
`/opt/osekola/releases/<source-sha>` directory. Confirm its `release.env` matches
the reviewed SHA and `dist/main.js` plus `node_modules` exist. Set
`/opt/osekola/current` to that directory. For upgrades, record the previous symlink
target and switch using a temporary symlink plus atomic rename; never overwrite
files in the running release. Retain the previous release for rollback.

Install `deploy/osekola/osekola-api.service` as
`/etc/systemd/system/osekola-api.service`, verify its paths/runtime and run
`systemd-analyze verify` before enabling it. Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now osekola-api
curl -fsS --max-time 5 http://127.0.0.1:3020/api/v1/health
curl -fsS --max-time 5 http://127.0.0.1:3020/api/v1/ready
```

For an upgrade to an already-running unit, use `systemctl restart osekola-api`
after switching the release; `enable --now` alone does not restart an active
service. Only this service is restarted. Check the release SHA and verify the
listener is loopback-only with `ss -ltn`. Readiness requires working production
Supabase configuration. Review `journalctl -u osekola-api` for this API's JSON
logs, and verify RIRI/Emerald are still healthy.

## 5. Add the API virtual host and certificate

Use a uniquely named `/etc/nginx/sites-available/osekola-api` and corresponding
sites-enabled link; preserve all existing vhosts. First install the supplied
`nginx-bootstrap.conf`, create `/var/www/osekola-acme` and confirm the API DNS
record points to this server. Run `sudo nginx -t`, then `sudo systemctl reload
nginx` only if the test succeeds. The bootstrap vhost serves ACME challenges and
returns 503 for API traffic until TLS is installed.

With the host's established certificate tooling, obtain a certificate for
**only** `api.osekola.com`; for Certbot use `certonly --webroot` with
`-w /var/www/osekola-acme -d api.osekola.com` and the operator's ACME email.
Do not replace certificates for RIRI/Emerald or run a standalone listener that
competes for port 80. After the certificate exists, replace only the osekola
vhost with `nginx-api.conf`, test Nginx again and gracefully reload. Establish
and test renewal for this certificate using the host's existing renewal timer.

The upstream is `127.0.0.1:3020`. No new firewall opening for that port is needed.
Keep API access logging off or use an explicitly redacted format; application
request logs already provide safe correlation. The main web-domain TLS
certificate is managed by Vercel independently of this API certificate.

## 6. Verify and promote the paired release

Deploy/promote the reviewed Vercel frontend and API built from the same source
SHA. Set GitHub production environment variables `API_ORIGIN=https://api.osekola.com`,
`WEB_ORIGIN=https://osekola.com`, and `EXPECTED_RELEASE_SHA=<source-sha>`, then
run **Read-only deployment verification**. Check actual browser login, cookies,
CORS, role navigation and multi-tenant workflows. Automated frontend deployments
can change its SHA before the API is upgraded: coordinate promotion and verify
both identities rather than treating a partial upgrade as a completed release.

Rollback uses the previous API release symlink and a restart of `osekola-api`,
paired with the matching previous Vercel deployment. Re-run probes and confirm
trading-service health. No SQL reversal is added by this deployment change.

## Remaining live gates

- [x] Operator's VPS inventory and initial capacity/port snapshot reviewed (2026-09-10 13:22:16 UTC).
- [ ] Isolated Node installation, CPU count/architecture, current public IP and refreshed pre-start capacity/port checks verified.
- [ ] Vercel project, production variables, DNS and web certificate verified.
- [ ] Production Supabase migration/Auth/Storage configuration verified.
- [ ] Isolated API installed, loopback listener verified and API TLS/renewal tested.
- [ ] RIRI/Emerald remain healthy after the shared-host change.
- [ ] Deployment probe and browser regression pass on the paired release.
- [ ] Operational monitoring, logging retention and recovery gates from Phase 55 pass.

Phase 43–50 live checks and all seven Phase 51–54 checks in
[issue #49](https://github.com/rhieryayunin-gass/sekola/issues/49) remain pending.
Phase 55 remains incomplete until actual live evidence is recorded.
