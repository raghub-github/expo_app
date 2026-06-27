# CI/CD secrets that MUST be set for dashboard + partnersite builds

> Audience: anyone who can `gh secret set` on this repo.
>
> Why this doc exists: dashboard and partnersite have `NEXT_PUBLIC_*`
> values that are **baked into the client bundle at `docker build` time**.
> When a workflow runs with an empty/unset secret, the resulting client
> JS has `undefined` where the value should be — producing user-visible
> bugs like "Phone login is not enabled" or "Mapbox token not
> configured", even though the runtime container env is correct.
>
> Last verified production regression caused by this: 2026-06-25 → the
> images on the VPS were built from CI before these secrets were set, so
> the client bundles shipped with the values missing.

## Required GitHub Action secrets

Set every one of these. Empty / missing secrets ship broken bundles.

| Secret | Used by | Purpose | Example value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | dashboard + partnersite | Supabase project endpoint | `https://uoxkwznciiibubtiiffh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dashboard + partnersite | Supabase anon key (safe in client) | `eyJhbGc…` |
| ~~`NEXT_PUBLIC_APP_URL`~~ | — | **Not a secret anymore.** Hard-coded in each workflow YAML to its own public origin (`control.gatimitra.com` for dashboard, `partner.gatimitra.com` for partnersite). The previous shared secret could only carry one value, so one service always shipped with the wrong origin. | — |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | dashboard + partnersite | Mapbox pk.* token; without it, every map widget renders the "Mapbox token not configured" banner | `pk.eyJ1IjoicmFnaH…` |
| `NEXT_PUBLIC_MERCHANT_ATTACHMENT_PROXY` | dashboard | API origin for proxying merchant attachments | `https://api.gatimitra.com` |
| `NEXT_PUBLIC_MERCHANT_R2_BASE_URL` | dashboard | R2 base for merchant assets | `https://4b9b7a72…r2.cloudflarestorage.com` |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | partnersite | R2 base for public assets | `https://4b9b7a72…r2.cloudflarestorage.com` |
| `NEXT_PUBLIC_DISABLE_CURRENT_LOCATION` | dashboard + partnersite | Toggle for "use my GPS" button | `true` |
| `NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN` | partnersite | Show the phone-login tab on the merchant login page. **If unset, the UI says "Phone login is not enabled."** | `true` |
| `NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER` | dashboard + partnersite | Show phone OTP option in the registration flow | `true` |

## Note on `NEXT_PUBLIC_APP_URL`

This is the only secret that must differ between dashboard and
partnersite builds. There are two workable approaches:

1. **Two secrets**: `DASHBOARD_NEXT_PUBLIC_APP_URL` +
   `PARTNERSITE_NEXT_PUBLIC_APP_URL`, then update each workflow's
   `build-args` to read the correctly-named secret. (cleanest)
2. **Hard-code in workflow**: leave `NEXT_PUBLIC_APP_URL` as a literal
   in the workflow YAML (the public origin is not secret).

We're using option 2 today — see `.github/workflows/dashboard.yml` line
82 and `.github/workflows/partnersite.yml` line 74. If you flip to
option 1, also rename the secret in this doc.

## How to set them

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL --body "https://uoxkwznciiibubtiiffh.supabase.co"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --body "eyJhbGciOi…"
gh secret set NEXT_PUBLIC_MAPBOX_TOKEN --body "pk.eyJ1IjoicmFnaH…"
gh secret set NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN --body "true"
gh secret set NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER --body "true"
gh secret set NEXT_PUBLIC_DISABLE_CURRENT_LOCATION --body "true"
gh secret set NEXT_PUBLIC_MERCHANT_ATTACHMENT_PROXY --body "https://api.gatimitra.com"
gh secret set NEXT_PUBLIC_MERCHANT_R2_BASE_URL --body "https://4b9b7a72…r2.cloudflarestorage.com"
gh secret set NEXT_PUBLIC_R2_PUBLIC_BASE_URL --body "https://4b9b7a72…r2.cloudflarestorage.com"
```

Use the actual values from `dashboard/.env.local` + `partnersite/.env.local`
on the production VPS at `/opt/gatimitra/`.

## How to detect this regression early

Every CI build should fail fast if any `NEXT_PUBLIC_*` build-arg is empty.
The workflows currently DO NOT do this — they happily ship undefined
values. Add a guard step at the top of each `Build and push` job:

```yaml
- name: Validate NEXT_PUBLIC_* secrets are set
  run: |
    set -e
    for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
               NEXT_PUBLIC_MAPBOX_TOKEN NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN \
               NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER ; do
      val="${!var}"
      if [ -z "$val" ]; then
        echo "::error::Missing secret: $var (would ship broken client bundle)"
        exit 1
      fi
    done
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
    NEXT_PUBLIC_MAPBOX_TOKEN: ${{ secrets.NEXT_PUBLIC_MAPBOX_TOKEN }}
    NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN: ${{ secrets.NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN }}
    NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER: ${{ secrets.NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER }}
```

## Workaround when secrets are missing

If you must ship a fix and CI secrets aren't set yet, build locally on the
VPS — this script reads the live `.env.local` (which is correct) and bakes
those values into the image:

```bash
ssh root@<vps>
cd /opt/gatimitra
bash infra/scripts/rebuild-local.sh dashboard partnersite
```

The script auto-recreates the compose service and waits for healthcheck.
