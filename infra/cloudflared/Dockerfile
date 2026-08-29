# cloudflared, plus the one binary needed to ask it whether it is healthy.
#
# WHY THIS IMAGE EXISTS AT ALL - HANDOFF-10 §3 COMMISSIONS THREE DOCKERFILES AND
# THIS IS A FOURTH. The contract says "cloudflared from an env token", which
# implies using the official image directly, and §5 A4 says every service in the
# compose file has a healthcheck. Those two requirements collide, and the
# collision is a fact about the upstream image rather than a matter of taste:
#
#   cloudflare/cloudflared's runtime stage is
#   `gcr.io/distroless/base-debian13:nonroot` (cloudflared/Dockerfile:23), and
#   the only executable it adds is `/usr/local/bin/cloudflared` (line 28).
#
# Distroless means NO SHELL and NO HTTP CLIENT. A Docker healthcheck runs inside
# the container it checks, so with that image the options are:
#
#   * `CMD ["cloudflared", "--version"]` - exits 0 whether or not a tunnel is
#     connected. That is a check that cannot fail, which CLAUDE.md makes a
#     finding in its own right; it would satisfy A4 by counting a `healthcheck:`
#     key while telling an operator nothing. Worse than none, because a green
#     tick is read as evidence.
#   * No healthcheck - fails A4, and leaves the one externally-facing component
#     of the stack as the only unmonitored one.
#
# cloudflared DOES publish the right signal; it just cannot reach it itself. Its
# metrics server serves `GET /ready` and `GET /healthcheck`
# (cloudflared/metrics/metrics.go:80-84), and `/ready` reports whether the
# tunnel has live connections to the Cloudflare edge - exactly the question an
# operator asks when the site is down. So this image adds a static busybox next
# to cloudflared and uses it to make that one request. Nothing else changes: the
# entrypoint, the user and the binary are upstream's.
#
# Build from the REPOSITORY ROOT for consistency with the other three:
#   docker build -f infra/cloudflared/Dockerfile -t zecreveal/cloudflared:local .

# Static, musl-linked busybox. It runs in a distroless image because it needs no
# loader and no libc beyond itself, which is the whole reason for choosing it
# over curl.
FROM busybox:1.37-musl AS busybox

# Pinned, not `latest`. A tunnel is the one component whose silent auto-upgrade
# would change the ingress behaviour of a production site, and the upstream
# image's own entrypoint already passes `--no-autoupdate` for the same reason.
FROM cloudflare/cloudflared:2026.8.2

COPY --from=busybox /bin/busybox /bin/busybox

# 65532 is the `nonroot` uid the upstream image runs as (cloudflared/Dockerfile:34).
# Restated here because a COPY as root above would otherwise leave this image
# running as root by inheritance if upstream ever reorders its own directives.
USER 65532:65532

# `/ready` answers 200 only while the tunnel holds at least one connection to the
# edge, and 503 otherwise, so this discriminates between "the process is up" and
# "the site is actually reachable" - which are different things and are the two
# states an operator confuses at 3am.
#
# The metrics address is set on the command line in docker-compose.yml
# (`--metrics 127.0.0.1:2000`); loopback because nothing outside this container
# should be able to read the tunnel's metrics, and because the check runs inside.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/bin/busybox", "wget", "--quiet", "--spider", "http://127.0.0.1:2000/ready"]
