# Thoughts and Notes
This is a rough TODO list/notepad for development for the site.

## Notes

Text-based ramblings that can cover a range of possible uses. They are tagged with the following categories:

- `Paper explainer`: Informal explanation of a paper that we have published, ideally accompanied by a video explanation.
- `Demo explainer`: Explanation of some technical details behind the inner workings of a demo.
- `Review`: A review of a field or introduction (these are mostly spin-off posts from my thesis).
- `Physics`
- `Information theory`
- `Inference`

Otherwise I imagine that most of the posts will be explanations of some idea that comes up in my research or something I am generally curious about that has the developed demos embedded within the explanations. 

### Development Details

In order to run the site locally, you will need to have Quarto installed. You can install it by following the instructions at [quarto.org/docs/get-started/](https://quarto.org/docs/get-started/).

To run the site locally, use the following command in the `quarto_src` directory:

```bash
quarto preview
```

This will start a local server and provide a link to view the site in your browser.

To build and host the site, run the following command in the `quarto_src` directory:

```bash
quarto render
```

This will build the site and output it to the `docs` directory, which is where GitHub Pages will serve from. Then push to the `main` branch of the repository. GitHub Pages will automatically build and host the site from the `docs` directory.

### Adding Notes

To create a new note, start by creating a new Quarto markdown file (`.qmd`) in the `quarto_src/notes/drafts` directory. The file should include:

- A title and date in the front matter
- A category (one of: `paper-explainer`, `demo-explainer`, or `general`)
- A description in the front matter (used for the summary)

You can generate an initial note from a TeX file using pandoc:

```bash
pandoc -s myfile.tex -o myfile.md
```

Then edit the resulting file to add the front matter and any additional content. Add an `assets-folder` to the front matter and reference images using that folder:

```
{{< meta assets-folder >}}/image.png
```

PDFs will render strangely and should be converted to raster images or vector formats like SVG. This can be done using Inkscape:

```bash
/mnt/c/Program\ Files/Inkscape/bin/inkscape.exe --export-type="svg" coin-flip-fair.pdf
```

You will also need to manually redo the cross-references.

**TODO**: Write a script that automatically adjusts the `.md` file output by pandoc into the `.qmd` format with the correct front matter and cross-references.

Once the note is ready, move it to the `quarto_src/notes/YEAR` directory.

### Adding demos
