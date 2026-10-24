Kenya Campaign Manager — aspirant setup fix (one change, applies to main at PR #9)

WHAT IT FIXES
- "You aren't a member…" when opening a campaign, even as super-admin (Supabase
  row-level security on shared tables). The header campaign menu works again.
- "Register an aspirant": candidate name, affiliated party (type freely; empty =
  Independent), the seat they're vying for and its area, election date, profile.
- After registering, the campaign opens straight on My Area for that seat:
  MCA = ward, MP = constituency, Governor / Senator / Woman Rep = county.
- Click any campaign to open it. "Details & members" has edit, Add members and
  "Delete permanently" (to remove test campaigns).

HOW TO APPLY (GitHub Codespace)
1. Upload this zip into the Codespace (drag it onto the Explorer) and run:
     unzip -o kcm-fix.zip
     bash kcm-fix/apply.sh
2. Open the link it prints, create the pull request, wait for the green check, merge.
3. On Render, wait until the new deploy shows "Live" (a few minutes).
4. rm -rf kcm-fix kcm-fix.zip

AFTER IT IS LIVE — REMOVE TEST DATA
Settings → Campaigns. For each test campaign: "Details & members" →
"Delete permanently" → type its name exactly. It removes the campaign and
everything recorded in it. The primary campaign can't be deleted.
If DEMO_ASPIRANTS_PASSWORD is set on Render, remove it first, or the three demo
campaigns are re-created at the next restart.
