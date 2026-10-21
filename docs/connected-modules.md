# Connected dashboard modules

All sidebar items are links to authorized pages. Role permissions still apply.
These changes reuse the existing campaign-owned records and provider tables; no new SQL needs to be pasted into Supabase.

## Opinion Polls

Open **Opinion Polls** to create questions and options, share a public poll, inspect results, close a poll, or reopen it. The existing polling backend and campaign geography remain in use. Participant contact registration is separate from ballot selections.

## Content Studio

Create drafts with copy, channel, creative asset URL and a planned publication time. Preview and download copy, send it for review, and record a published link. Approval requires another authorized user. Editing reviewed or approved copy returns it to draft; published records are final. History and exports remain available.

The planned time is an editorial schedule. This workflow does not automatically publish posts to social networks. Publication status records a human publishing action.

## WA Templates

Drafts, previews and local archiving work without an external account. Use lowercase template names, a language code such as `en_US` or `sw`, and numbered body placeholders with corresponding examples. This editor supports text headers, bodies and footers.

For provider actions, open **Messaging → WhatsApp → Provider settings**, choose **Meta Cloud API**, and save an active provider with:

- Meta access token with the appropriate WhatsApp Business Management/Messaging permissions;
- WhatsApp Business Account ID;
- Phone Number ID for sending test messages.

Submit a draft to Meta and use **Sync status** to retrieve the approval decision. An approved template can send a real test to a number entered and confirmed in the test form. Acceptance by Meta is distinct from confirmed delivery. Archiving is local and does not delete the template from Meta.

The default Graph API version is `v23.0`; operators can override it with `META_GRAPH_VERSION`.

## AI Deepfake Detection

An administrator opens **Provider settings** in the module and saves Sightengine API user and secret. Credentials are encrypted with `INTEGRATION_SECRET`, falling back to the existing `SESSION_SECRET`. Keep this key stable; after rotation, re-enter stored detector credentials. Credentials are never returned by the read APIs. Server-wide `SIGHTENGINE_API_USER` and `SIGHTENGINE_API_SECRET` environment variables are an alternative.

Analyze JPEG, PNG, WebP, MP4 or WebM files up to 20 MB. Videos must be under 60 seconds for the synchronous provider API. Files are forwarded to Sightengine; the application retains scores, frame results, provider request ID and SHA-256 fingerprint, not the original file. Reports can be downloaded and archived locally. Detector scores are evidence for human review and do not prove authenticity.

A usable provider account, sufficient credits, valid credentials and provider availability are required for live scans. Missing credentials and upstream failures produce explicit errors, never generated scores.

## Validation

Workspace typechecking, production build and acceptance tests cover the changes. Additional HTTP/PostgreSQL fixture tests exercised campaign separation, Meta payloads/statuses, content approval rules, encrypted credentials, upload validation and report persistence. Desktop/mobile browser checks exercised all four pages. Provider calls in tests were mocked; no live messages were sent, and live provider accounts were not authenticated during development.
