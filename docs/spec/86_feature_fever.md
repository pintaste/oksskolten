# Oksskolten Spec — Fever API

> [Back to Overview](./01_overview.md)

## Overview

A Fever-compatible sync API so third-party RSS clients (Reeder, ReadKit, Unread, etc.) can read articles and sync read/saved state with Oksskolten. The [Fever API](https://feedafever.com/api) is a de facto standard protocol: a single endpoint authenticated with an MD5 api_key, exchanging groups, feeds, items, and read/saved item id lists.

## Motivation

Oksskolten's own API is JSON/Bearer-token based and only usable by its bundled web frontend or custom scripts. Many users read RSS primarily in native mobile/desktop clients. Implementing the Fever protocol — the most widely supported third-party sync API — lets those clients use Oksskolten as their backend without any client-side changes.

## Design

### Endpoint

`POST /api/fever?api` (a `GET` route also exists but cannot authenticate, since the api_key must be POSTed). The endpoint is registered outside the normal `requireAuth` scope because the protocol carries its own authentication. Per the Fever spec, read arguments are passed in the query string and write arguments in the POST body, and authentication failures still return HTTP 200 with `auth: 0`.

A scoped `application/x-www-form-urlencoded` content type parser is registered inside the Fever plugin only, leaving the JSON-only main API unaffected.

### Authentication

Clients send `api_key = md5("username:password")` as POST form data. Oksskolten stores only the MD5 hash (never the password) in the `settings` table:

| Key | Value |
|---|---|
| `fever.enabled` | `on` / `off` |
| `fever.username` | display/recompute helper for the settings UI |
| `fever.api_key_hash` | `md5("username:password")`, lowercase hex |

The hash comparison uses `crypto.timingSafeEqual`. MD5 is a protocol requirement of Fever, not a security choice; the credential should be treated as a bearer secret and the API kept disabled when unused.

### Data mapping

| Fever concept | Oksskolten source |
|---|---|
| `groups` | `categories` |
| `feeds` | `feeds` (`url` = `rss_url` fallback `url`, `site_url` = `url`, `is_spark` always 0) |
| `items` | `active_articles`; `html` is `full_text` (fallback `excerpt`) rendered from Markdown via marked |
| `is_read` | `seen_at IS NOT NULL` (the app's unread concept) |
| `is_saved` | `bookmarked_at IS NOT NULL` |
| `created_on_time` | `COALESCE(published_at, created_at)` as Unix epoch |
| `favicons`, `links` | returned empty (not stored / Hot Links not supported) |

Items are paginated 50 at a time via `since_id`, `max_id`, or `with_ids` per the spec, with `total_items` included.

### Write operations

| POST arguments | Effect |
|---|---|
| `mark=item&as=read\|unread&id=N` | `markArticleSeen` (keeps search index in sync) |
| `mark=item&as=saved\|unsaved&id=N` | `markArticleBookmarked` |
| `mark=feed\|group&as=read&id=N&before=T` | mark unseen articles with `created_on_time <= T` as seen; group `id=0` (Kindling) means all feeds, `id=-1` (Sparks) is a no-op |
| `unread_recently_read=1` | revert articles seen within the last hour to unseen |

Write responses include the updated `unread_item_ids` or `saved_item_ids` member as clients expect.

### Settings

Settings → Security → Fever API: set a username and password (PATCH `/api/settings/fever`, which hashes server-side), then enable the toggle. Enabling is rejected until credentials exist. The UI shows the endpoint URL to enter in the client once enabled. Config routes live inside the authenticated API scope.

### Key Files

| File | Description |
|---|---|
| `server/routes/fever.ts` | Public Fever endpoint + authenticated config routes |
| `server/db/fever.ts` | Fever-shaped read queries (epoch conversion, pagination) |
| `src/components/settings/fever-settings.tsx` | Settings UI (credentials, toggle, endpoint URL) |
