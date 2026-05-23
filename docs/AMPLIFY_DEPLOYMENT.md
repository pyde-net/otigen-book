# AWS Amplify Hosting — runbook

The Otigen Book deploys to AWS Amplify Hosting. Amplify owns the build
runner, the storage, the CDN, and the certificate. Push to `main`,
Amplify rebuilds and rolls out automatically.

Subdomain: **`otigen-book.pyde.network`**. The `book.pyde.network`
slot belongs to the current Pyde Book; the `otigen.pyde.network` slot
is reserved for the current `otigen` toolchain's docs. Using
`otigen-book.pyde.network` for the historical reference keeps all
three names distinct.

DNS stays at Namecheap; we add two CNAMEs there pointing at Amplify's
CDN target. Same shape as the main book's deploy at
`pyde-net/pyde-book/docs/AMPLIFY_DEPLOYMENT.md` — only the subdomain
and the bucket / role names differ.

---

## 1 · Connect the repo

1. AWS console → Amplify → **Create new app** → **Host web app**.
2. Source: **GitHub**. If `pyde-net/otigen-book` doesn't appear in the
   repo dropdown, click **Update GitHub App permissions** → tick
   `otigen-book` → Save → reload Amplify.
3. Repository: `pyde-net/otigen-book`. Branch: `main`. Next.

---

## 2 · Review build settings

1. **App name**: `otigen-book`.
2. **Environment**: `production`.
3. **Service role**: reuse the existing `amplifyconsole-backend-role-…`
   you created for the website / pyde-book deploys. No new role needed.
4. **Build and test settings** shows the contents of `amplify.yml`:
   - preBuild: download mdBook 0.4.40, generate sitemap.xml
   - build: `mdbook build`
   - baseDirectory: `book`
5. Next → **Save and deploy**.

First build runs in ~30 s. All four stages (Provision → Build →
Deploy → Verify) should go green.

Click the temp URL Amplify gives you (`https://main.dXXXX.amplifyapp.com`)
to verify the book renders — `pivot-notice.md` should be the first
page surfaced, followed by the foreword, intro, and chapter list.

---

## 3 · Add the `otigen-book.pyde.network` subdomain

1. App page → **App settings** → **Domain management**.
2. **Add domain** → type `pyde.network` → Configure domain.
3. Default rows show `(root)` + `www`. **Delete both** with the trash
   icon — those belong to other apps.
4. **Add new** → subdomain `otigen-book`, branch `main`.
5. SSL: leave **Amplify managed certificate** (the default).
6. Save → when prompted about Route 53 hosted zone, pick
   **Manual configuration** (DNS stays at Namecheap).

Amplify shows 2 records: a validation CNAME + a routing CNAME.

---

## 4 · Paste records at Namecheap

Namecheap → Domain List → `pyde.network` → **Manage** → **Advanced
DNS** tab → scroll to **Host Records**.

| # | Amplify shows | Namecheap **Type** | Namecheap **Host** | Namecheap **Value** | TTL |
|---|---|---|---|---|---|
| 1 | Validation — `_xxx.otigen-book.pyde.network` → `_yyy.acm-validations.aws` | **CNAME Record** | `_xxx.otigen-book` (strip `.pyde.network`) | `_yyy.acm-validations.aws` (verbatim) | Automatic |
| 2 | Routing — `otigen-book.pyde.network` → `dXXXX.cloudfront.net` | **CNAME Record** | `otigen-book` | `dXXXX.cloudfront.net` | Automatic |

Both records are plain CNAMEs — no ALIAS needed (ALIAS is only for
the apex `@`).

Click the green ✓ checkmark to save each.

---

## 5 · Wait for Amplify to verify (~5–15 min)

Back in Amplify's Domain management panel. Status moves:

1. Pending verification → DNS propagating (1–10 min)
2. Issuing certificate → ACM provisioning (1–5 min)
3. Configuration in progress → CloudFront edges (1–5 min)
4. **Available** → ✅ live

Open `https://otigen-book.pyde.network` → the book loads with the
Pyde favicon, lock icon, and the pivot-notice as the first surfaced
page.

---

## 6 · Verify SEO + sitemap

```
https://otigen-book.pyde.network/sitemap.xml       → XML, all chapters
https://otigen-book.pyde.network/robots.txt        → points at sitemap
https://otigen-book.pyde.network/site.webmanifest  → PWA manifest
```

Social-preview check (one-time, post-launch):
- Twitter card validator: <https://cards-dev.twitter.com/validator>
- LinkedIn post inspector: <https://www.linkedin.com/post-inspector/>
- Facebook sharing debugger: <https://developers.facebook.com/tools/debug/>

The card title should read "**The Otigen Programming Language —
Historical Reference**", not just the book title — making the
retired status obvious to scrollers without requiring a click.
