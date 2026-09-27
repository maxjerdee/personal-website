# Quarto site tasks. Run from the repo root.
#
# WHY `preview` EXISTS. Draft notes (the network spotlights) are marked
# `draft: true`, and quarto_src/_quarto.yml sets `draft-mode: gone` so they
# render as an empty stub and never reach the published site. Seeing them
# locally needs QUARTO_PROFILE=drafting, and a preview started without it
# serves a BLANK PAGE rather than an error -- which looks exactly like a broken
# server, and cost an afternoon once. This target cannot forget the profile.

QUARTO ?= quarto
PORT   ?= 4200

.PHONY: preview render render-drafts clean-preview sync-edgewise help

help:
	@echo "make preview        # local site WITH drafts visible (port $(PORT))"
	@echo "make render         # build docs/ as it will be published (drafts hidden)"
	@echo "make render-drafts  # build docs/ WITH drafts -- do not commit the result"
	@echo "make clean-preview  # stop any running preview"
	@echo "make sync-edgewise  # rebuild /edgewise from edgewise origin/main"
	@echo ""
	@echo "Override the port with:  make preview PORT=4300"

# Drafts visible. This is the one to use while writing.
preview:
	cd quarto_src && QUARTO_PROFILE=drafting $(QUARTO) preview --port $(PORT)

# Exactly what CI publishes: drafts render as empty stubs, absent from the
# listing and from search. Safe to commit.
render:
	cd quarto_src && $(QUARTO) render

# Drafts included. Useful to check a draft renders, but docs/ is then NOT
# publishable -- run `make render` again before committing.
render-drafts:
	cd quarto_src && QUARTO_PROFILE=drafting $(QUARTO) render

# Rebuilds the vendored explorer from edgewise's origin/main, in a throwaway
# worktree so the shared checkout's uncommitted state cannot reach it.
sync-edgewise:
	python3 tools/sync_edgewise.py --apply

clean-preview:
	-pkill -f "quarto.js preview" 2>/dev/null || true
