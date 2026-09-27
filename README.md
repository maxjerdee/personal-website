## Max Jerdee's personal website

Hosted at [maxjerdee.com](https://www.maxjerdee.com/)

Built with the [quarto framework](https://quarto.org/)

## Editing the site locally

    make preview        # http://localhost:4200, drafts visible
    make render         # build docs/ exactly as it will be published

Notes marked `draft: true` (the network spotlights, while their prose is being
written) render as an EMPTY STUB by default and appear in no listing or search,
so a half-written note can live in the repo without being readable on the site.
`make preview` sets `QUARTO_PROFILE=drafting`, which makes them visible.

A preview started without that profile serves those pages as a blank page rather
than an error, which looks exactly like a broken server. Use `make preview`.

Publish a spotlight when its prose is ready:

    python tools/build_spotlights.py --publish

### Before you commit

`docs/` is the published site and is committed from your machine — CI no longer
re-renders it, because doing both paid twice for the same output and the two
renders collided. So:

    make render      # then commit docs/ along with your source change

`make preview` renders to `_preview/` and never touches `docs/`, so previewing
drafts cannot leave draft content in the published output.
