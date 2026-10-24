Kenya Campaign Manager — "End demo" (applies to main at PR #10)

WHAT IT ADDS
Settings → Campaigns → "Demo aspirants" box:
- "End demo and delete demo data" (type END DEMO): deletes demo.mca, demo.mp and
  demo.governor, their campaigns and everything recorded in them, and signs them
  out. The demo stays ended after restarts, even if DEMO_ASPIRANTS_PASSWORD is set.
- "Start demo again": rebuilds the demo when you need it (needs
  DEMO_ASPIRANTS_PASSWORD on Render).
Any other test campaign: "Details & members" → "Delete permanently".

HOW TO APPLY (GitHub Codespace)
1. Drag this zip onto the Explorer, then:
     unzip -o kcm-end-demo.zip
     bash kcm-end-demo/apply.sh
2. Open the link it prints, create the pull request, wait for the green check, merge.
3. When Render shows the new deploy as "Live", it's ready.
4. rm -rf kcm-end-demo kcm-end-demo.zip
