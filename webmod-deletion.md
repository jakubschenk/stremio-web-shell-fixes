# Webmod Deletion Plan

## Goal

Move long-lived webmod behavior into native Stremio Web code and server-side metadata enrichment, then delete the fragile DOM mutation layer.

## Metadata Direction

AIOMetadata already returns most of the fields the current detail/data enrichment webmods are trying to reconstruct:

- `id`, `imdb_id`, `_imdbId`, `_tmdbId`, `_tvdbId`
- `type`, `name`, `title`, `year`
- `poster`, `_rawPosterUrl`, `background`, `logo`
- `description`, `runtime`, `released`, `releaseInfo`
- `genre`, `genres`, `country`
- `cast`, `director`, `writer`
- `links` for share, genres, cast, writers, directors
- `trailerStreams`, `trailers`
- `popularities`, `popularity`
- `app_extras.certification`

The main gap is rendering: the web app currently displays only a conservative subset of the meta object.

## Server-Side Wrapper

Preferred long-term shape:

```text
Stremio Web -> aiometadata-plus addon -> AIOMetadata -> optional TMDB/MDBList/etc enrichment -> cached normalized meta response
```

The wrapper should preserve AIOMetadata fields exactly and add richer optional data under `app_extras`:

```js
app_extras: {
  certification,
  tagline,
  country,
  status,
  network,
  studio,
  ratings: {
    imdb,
    tmdb,
    trakt,
    letterboxd,
    rottenTomatoes,
    rottenTomatoesAudience,
    metacritic,
    mdblist,
    mal
  },
  cast: [{ name, character, image }],
  directors: [{ name, image }],
  writers: [{ name, image }],
  collection,
  similar,
  recommendations
}
```

Unknown fields remain compatible with normal Stremio clients, while our web repo can render them natively.

## Caching

Use server-side caching, preferably Redis or SQLite:

- AIOMetadata proxy response: 6-24h
- TMDB detail data: 7-30d
- Ratings: 12-48h
- Credits/person images: 30d+
- New/upcoming titles: shorter, around 6h
- Failed lookups: negative cache for 1-6h

Catalog endpoints should stay lightweight. Full enrichment belongs on meta/detail requests. Catalog items can be warmed in the background with stale-while-revalidate.

## Web Repo Rendering Gaps

Native React rendering should cover:

- `app_extras.certification` in the detail meta row
- `country`, `year`, `runtime`, status/network/studio when present
- better genre badges from `genres` or `links`
- cast/director/writer sections from AIOMetadata arrays and enriched `app_extras`
- richer ratings row from `app_extras.ratings`
- episode overview/thumbnail rendering from native `videos`
- optional `_rawPosterUrl` fallback use

## Webmods To Delete Instead Of Port

Do not port these as-is:

- client-side TMDB/MDBList fetchers
- IndexedDB metadata storage
- DOM route scraping
- mutation-observer detail injection
- context menu portal hacks
- subtitle menu DOM mutation

These exist because webmods operate outside React. Native code should render data directly from meta objects.

## Suggested Deletion Order

1. Port player fixes and styling natively.
2. Port theme CSS into repo Less files.
3. Add native detail-page rendering for existing AIOMetadata fields.
4. Build the AIOMetadata wrapper for true missing data.
5. Render `app_extras` in the web repo.
6. Disable/delete detail/data enrichment webmods.
7. Disable/delete player DOM mutation webmods.
