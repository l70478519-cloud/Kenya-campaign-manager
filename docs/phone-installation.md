# Phone installation and reduced downloads

Open the deployed HTTPS site once while connected, then choose **Install phone app**. Supported Chromium browsers offer their native install prompt when eligible. On iPhone/iPad use Safari → Share → Add to Home Screen (Open as Web App when offered). Installation works without an app-store download. The installed app uses the same account, permissions and database as the website.

The manifest includes PNG icons, standalone display and an orientation-independent start route. Public interface JavaScript and CSS are cached on-device; content-hashed files also receive long-lived HTTP cache headers. Deployment generates `precache.json` from the actual build output. Browser-managed storage may be removed by the device or when browsing data is cleared. First installation and new software versions require a connection.

Offline navigation displays an explicit offline page. If already open when connectivity drops, a status notice explains the limitation. Authentication, current dashboard/API data, AI, sending messages and saving reports remain online operations. There is no offline write queue or automatic replay in this change. Keep unsaved forms open and reconnect before submitting; reopening an offline app does not restore unsaved forms. Private API responses, credentials, contacts and voter records are not placed in the service-worker cache.

The worker does not force-reload existing pages when a new release arrives, so open forms keep their current version. Cached hashed assets remain available across updates. New versions activate after existing controlled tabs close. The service worker and install metadata are revalidated, rather than given immutable HTTP caching.

Phone/tablet support includes a collapsible navigation drawer, safe-area spacing, 44px touch controls, readable inputs and tables that scroll within the content area. Landscape orientation is allowed. Desktop layout remains available on wider screens.

Validation: service-worker tests cover public-only precaching, API/mutation/external request bypass, cached assets without network, offline navigation fallback and manifest PNG dimensions. Real device installation and Render deployment must still be verified on the deployed HTTPS origin.
