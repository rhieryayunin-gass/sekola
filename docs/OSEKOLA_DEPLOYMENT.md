# osekola.com — Vercel frontend and shared production VPS

Selected by the user on 2026-09-10. The operator has verified the API on the VPS
loopback interface. Public API access and the Vercel frontend remain unverified.

| Component | Selected target |
| --- | --- |
| Web frontend | Vercel team `albi-s-agentic`, project `osekola`, Next.js root directory `apps/web` |
| Main website | `https://osekola.com`; `www.osekola.com` redirects to the apex |
| Backend/API | `https://api.osekola.com` on the existing `riri-prod-01` VPS |
| API process | systemd `osekola-api`, separate Linux user/group `osekola` |
| API files | `/opt/osekola/releases/<source-sha>` and `/opt/osekola/current` |
| API Node runtime | `/opt/osekola/runtime/node/bin/node`, isolated Node.js 22.23.2 |
| API secrets | `/etc/osekola/api.env`, root-owned mode 0600 |
| API listener | `127.0.0.1:3020`, operator-verified on 2026-09-10 |
| Database/Auth | User-selected project `xrqjutbwnlkogpfhtuwr`; production migration/Auth/Storage verification pending |
| Public ingress | Existing Nginx, a separate `api.osekola.com` virtual host |
| VPS public IPv4 | `34.101.129.25`, confirmed by the operator on 2026-09-10 |
| DNS provider | Cloudflare, selected by the operator |

The server is the VPS computer running the backend processes. Vercel hosts the
school's frontend; Supabase hosts its database/Auth. RIRI and Emerald continue
using their own processes, directories, ports and configuration. Their recent
records identify `riri-api` and `riri-emerald-api`, with ports 8000/8010. The
operator supplied the live inspection below and subsequently confirmed the public
IPv4 above. Public API routing still requires its own verification.

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
sizing or an application health check. The API was undeployed at that inspection;
the later activation evidence is recorded below. CPU count, architecture and
current public IP were not included in that initial output. Refresh capacity and
port checks before future changes, accounting for the now-running osekola API.

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

**Operator-confirmed installation:** after PR #52, the operator reported the
official archive checksum `OK` and `OSEKOLA_NODE_READY` for Node.js `v22.23.2` at
`/opt/osekola/runtime/node/bin/node`. The reported architecture is `x86_64` and
the CPU count is **2**. The pasted metadata-query output did not contain an IP
address; this does not establish that the VM has no public IP. Subsequent API
staging and local activation are recorded below; public release checks remain
pending.

### Operator-confirmed API activation

The operator staged the artifact from [PR #53](https://github.com/rhieryayunin-gass/sekola/pull/53)
and its successful [main CI run](https://github.com/rhieryayunin-gass/sekola/actions/runs/34486087640),
then configured `https://xrqjutbwnlkogpfhtuwr.supabase.co` as the selected database
endpoint. The credential stayed in `/etc/osekola/api.env`; no credential value is
recorded here. The pre-start check reported `OSEKOLA_CONFIG_OK` and
`OSEKOLA_DB_READY`.

The user supplied the following activation and local HTTP evidence on
**2026-09-10 at 14:27 UTC**:

| Check | Operator-reported result |
| --- | --- |
| Staged and running source | `68a3db128387f662f376a92b61e6b279e4ecb84b` |
| Refreshed pre-start capacity | 2825 MiB available RAM of 3910 MiB; no swap |
| Pre-start guards | Port 3020 free; RIRI, Emerald and Nginx active; API configured for loopback port 3020 |
| Service activation | Unit verification passed; `enable --now osekola-api` created the boot-enablement symlink |
| `/api/v1/health` | `success: true`, `status: ok`, exact source above, uptime 9 seconds at `14:27:42.692Z` |
| `/api/v1/ready` | `success: true`, `status: ready` at `14:27:43.042Z` |
| Listening socket | `127.0.0.1:3020` |

Readiness exercises a bounded read of `calendar_events` through the configured
Supabase client. It does not inspect the complete migration history, Auth/Storage
settings, tenant workflows or backup coverage. The chosen project's relationship
to the earlier staging database has not been verified; prior staging migration
success is not automatically production evidence. Post-change RIRI/Emerald
health, public DNS/TLS and the frontend still require their own checks.

The first-install staging and free-port activation commands have already been
completed for this release. Use the upgrade procedure for subsequent API changes.
Documentation-only commits after this checkpoint do not change the source SHA
reported by the running API; coordinate the actual web/API release before the
paired-release verification in section 6.

## 2. Prepare the Vercel project and DNS

The operator supplied [the intended Vercel project](https://vercel.com/albi-s-agentic/osekola).
The connected Vercel app returned `403 Forbidden` for this team/project during
setup. Account/team authorization must be resolved before its deployment state
can be inspected or changed; the URL does not establish successful deployment.

In Cloudflare's DNS records for `osekola.com`, add or edit the intended API record:
type **A**, name **api**, IPv4 **34.101.129.25**, proxy status **DNS only**, TTL
**Auto**. This selected initial mode routes directly to the VPS for certificate
issuance and public verification. The apex and `www` records must use the exact
values shown by this Vercel project. Do not substitute the API's VPS IP for the
frontend records. The operator subsequently showed the API A record in Cloudflare
and successful resolution from the VPS; the DNS and certificate checkpoint below
records this separately from frontend verification.

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

The main-branch CI quality job now stores `osekola-api-<source-sha>` after packaging
and staging tests. **Only use it after the complete CI run, including every job,
has concluded successfully.** An artifact can appear before other jobs finish.
Alternatively run **Package osekola API release** on `main` and check that exact
source SHA already passed CI. Neither workflow deploys to a server.

The artifact contains four files: `osekola-api.tar.gz`, its `.sha256` checksum,
`osekola-api-stage.sh`, and `osekola-api-release.txt` with the source SHA. The
archive contains compiled API code, production dependencies, build platform and
architecture metadata, `release.env`, a blank environment template and the service
unit. It contains no Supabase credentials. Verify the published archive SHA-256
independently of the downloaded copy, then transfer the files through the existing
authenticated SSH/SCP workflow or the SSH console's file-upload control.

## 4. Install the isolated API

For the **first installation**, the artifact's staging script implements the
file/account setup below and stops before service activation. It requires the
isolated Node runtime and Python 3 with `tarfile` data-filter support (available
on the selected Ubuntu 24.04 host). From the directory containing the artifact's
four extracted files:

```bash
sudo bash osekola-api-stage.sh osekola-api.tar.gz <reviewed-source-sha> <published-archive-sha256>
sudoedit /etc/osekola/api.env
```

Use the independently reviewed SHA values, not the literal placeholders. The
staging script validates archive checksum, source SHA, platform/architecture and
archive paths/links, creates the separate `osekola` user, installs a root-owned
release and mode-0600 environment template, then prints `OSEKOLA_API_STAGED`.
It refuses an existing release, current symlink, account, unit or environment
file rather than overwriting an installation. A second invocation requires
review; use the upgrade procedure for later releases. It never enables, starts,
restarts or reloads a service.

Fill the production `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally in the
editor. Confirm this is the intended production database and that its migration
history through `0059` has been checked; staging migration success is separate
evidence. Share only configuration-presence or validation results, not secrets.
The subsequent activation and readiness checks below remain separate steps.

For a manual installation, use the same layout:

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

For this first installation, the reviewed `ops/bootstrap-osekola-nginx.sh` accepts
the reviewed `deploy/osekola/nginx-bootstrap.conf` file as its only argument:

```bash
sudo bash ops/bootstrap-osekola-nginx.sh deploy/osekola/nginx-bootstrap.conf
```

It checks the template digest, protected directories, existing Nginx state and
hostname conflicts, then installs only the osekola HTTP vhost, tests Nginx and
gracefully reloads it. It verifies a local ACME challenge probe and prints
`OSEKOLA_NGINX_HTTP_READY`. A failed configuration/reload/probe rolls back the
new vhost. Existing osekola files are refused for review. It never requests a
certificate, edits DNS, restarts the API or changes a sibling vhost. The local
probe is not evidence of public DNS or ingress. Ubuntu CI exercises the real
Nginx daemon, a failed-reload rollback and sibling-vhost preservation.

After Cloudflare's API DNS record resolves to the confirmed VPS IP and the HTTP
setup succeeds, run Certbot interactively using the existing host account:

```bash
sudo certbot certonly --webroot -w /var/www/osekola-acme \
  --cert-name api.osekola.com -d api.osekola.com
```

Complete any account/contact prompts locally. Only after certificate issuance
succeeds, install the TLS vhost and verify renewal as described below.

### Operator-confirmed DNS and certificate checkpoint

On **2026-09-10**, the operator reported `OSEKOLA_NGINX_HTTP_READY` after
[PR #55](https://github.com/rhieryayunin-gass/sekola/pull/55), including the local
ACME route check. A repeat invocation was correctly refused because the vhost
already existed; it did not undo the completed installation.

The first public DNS queries still showed `pixel.dns-parking.com` and
`byte.dns-parking.com`, with Cloudflare pending and the API name returning
NXDOMAIN. After the operator followed the nameserver setup, `getent ahostsv4
api.osekola.com` on the VPS returned **34.101.129.25**. No separate Cloudflare
Active-status screenshot or final public NS response was supplied.

Certbot then reported **Successfully received certificate**, with expiry
**2026-12-09**, at `/etc/letsencrypt/live/api.osekola.com/fullchain.pem` and its
matching private-key path. No private-key contents were shared. The successful
webroot issuance provides evidence of public ACME HTTP validation. Certbot also
reported a scheduled renewal task; neither renewal execution nor HTTPS service
activation is established by certificate issuance alone.

### Activate the reviewed HTTPS vhost

From a reviewed checkout, run:

```bash
sudo bash ops/activate-osekola-tls.sh deploy/osekola/nginx-api.conf
```

The helper accepts only the known HTTP bootstrap and matching enabled link,
checks root-controlled directories, active Nginx/API/RIRI/Emerald services,
certificate trust/hostname and remaining validity, then captures local API
health and release identity. It copies and checks the TLS template before use,
keeps the prior HTTP configuration in `/opt/osekola/nginx-backups/tls-*`, and
replaces only the osekola vhost. A failed Nginx test, reload, HTTPS probe or
post-change service check restores and reloads the HTTP bootstrap. It refuses
repeat activation or an existing osekola renewal hook for review.

Success reports `OSEKOLA_TLS_READY` only after HTTPS through loopback validates
the real certificate, health/readiness and unchanged API release. It installs
`/etc/letsencrypt/renewal-hooks/deploy/50-osekola-nginx-reload`, which tests Nginx
and gracefully reloads it only when `RENEWED_LINEAGE` is exactly the osekola
certificate directory. Other certificate hooks, units, secrets and vhosts are
not edited. Service-active checks do not establish complete RIRI/Emerald health.

Ubuntu CI uses a disposable trusted certificate and a fixture API with the real
Nginx daemon to test HTTPS, release identity, ACME continuity, rollback on reload
and readiness failures, unchanged sibling HTTP/HTTPS, repeat/conflict refusal,
and the renewal hook's certificate scope and config-test guard. These fixture
checks are not production ACME renewal or application workflow evidence.

After activation, check public ingress and the existing renewal schedule:

```bash
curl -fsS --max-time 10 https://api.osekola.com/api/v1/health
curl -fsS --max-time 10 https://api.osekola.com/api/v1/ready
sudo systemctl list-timers --all --no-pager 'certbot*'
sudo certbot renew --cert-name api.osekola.com --dry-run \
  --no-directory-hooks --run-deploy-hooks \
  --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/50-osekola-nginx-reload
```

The dry-run selects only this certificate and explicitly tests its new reload
hook; unrelated directory hooks are excluded from this manual test. Inspect any
pre/post hooks saved specifically for this certificate before running the test.
The normal existing renewal schedule continues to discover the scoped hook in
the deploy directory. Verify the timer's future trigger and the dry-run result;
do not infer successful renewal from Certbot's scheduler message alone. Confirm
RIRI/Emerald health using their established operational checks after changes.

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
- [x] Operator confirmed isolated Node v22.23.2 installation, x86_64 architecture and 2 CPUs after PR #52.
- [x] Refreshed pre-start capacity/port checks passed before local API activation (2825 MiB available RAM, port 3020 free).
- [x] Selected Supabase endpoint configured; environment validation and basic database readiness passed.
- [x] Isolated API installed and enabled; exact release, local health/readiness and loopback listener verified by the operator at 2026-09-10 14:27 UTC.
- [x] Operator confirmed current public IPv4 `34.101.129.25`; selected Cloudflare DNS and Vercel team/project `albi-s-agentic/osekola`.
- [x] Operator confirmed HTTP/ACME bootstrap, API DNS resolution from the VPS and successful public webroot certificate issuance (expires 2026-12-09).
- [ ] Vercel project, production variables, DNS and web certificate verified.
- [ ] Production Supabase migration/Auth/Storage configuration verified.
- [ ] HTTPS vhost activated; public API HTTPS health/readiness and certificate renewal tested.
- [ ] RIRI/Emerald remain healthy after the shared-host change.
- [ ] Deployment probe and browser regression pass on the paired release.
- [ ] Operational monitoring, logging retention and recovery gates from Phase 55 pass.

Phase 43–50 live checks and all seven Phase 51–54 checks in
[issue #49](https://github.com/rhieryayunin-gass/sekola/issues/49) remain pending.
Phase 55 remains incomplete until actual live evidence is recorded.
