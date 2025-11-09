# Thoughts and Notes
This is a rough TODO list/notepad for development for the site.

## Notes
Text-based ramblings that can cover a range of possible uses. They are also tagged with categores as: 
- `Paper explainer`: informal explanation of a paper that we have put out, ideally accompanied by some sort of video explaination
- `Demo explainer`: explanation of some technical details behind the inner workings of a demo
- `Review`: a review of a field or introduction (these are what most of the spin-off posts from my thesis are)
- `Physics`
- `Information theory`
- `Inference`

Special categories for the notes posts are roughly supposed to be:
Paper explainer: informal explanation of a paper that we have put out, ideally accompanied by some sort of video explaination
Demo explainer: explanation of some technical details behind the inner workings of a demo
Review: a review of a field or introduction (these are what most of the spin-off posts from my thesis are)

Otherwise I imagine that most of the posts will be explanations of some idea that comes up in my research or something I am generally curious about that has the developed demos embedded within the explanations. 

### Development details (mostly for my own reference)
In order to run the site locally, you will need to have quarto installed. You can install it by following the instructions at [quarto.org/docs/get-started/](https://quarto.org/docs/get-started/).
To run the site locally, you can use the following command:

```bash
quarto preview
```
in the `quarto_src` directory. This will start a local serve and give a link to view the site in your browser.

In order to build and host the site, run `quarto render` in the `quarto_src` directory. This will build the site and output it to the `docs` directory, which is where GitHub Pages will serve the site from. Then push to the `main` branch of the repository. GitHub Pages will automatically build and host the site from the `docs` directory.

### Adding notes
To create a new note, we should start by creating a new Quarto markdown file (.qmd) in the `quarto_src/notes/drafts` directory. The file should have a title and a date in the front matter, as well as a category. The category should be one of the following: `paper-explainer`, `demo-explainer`, or `general`. The file should also have a description in the front matter, which will be used to generate the summary for the note. We can also generate an initial note using pandoc from say a TeX file as `pandoc -s myfile.tex -o myfile.md` and then edit the resulting file to add the front matter and any additional content we want to include. We will need to add an `assets-folder` to the front matter then reference any images using that folder, for example: `{{< meta assets-folder >}}/image.png`.

pdfs will also render in a strange way, we can convert them either to raster images or another vector format like svg. This can be done using for example inkscape as 

```bash
/mnt/c/Program\ Files/Inkscape/bin/inkscape.exe --export-type="svg" coin-flip-fair.pdf
```

We will also need to manually redo the cross-references.
TODO: write a script that automatically adjusts the .md file output by pandoc into the .qmd format with the correct front matter and cross-references. 

Once the note is ready, we can move it to the `quarto_src/notes/YEAR` directory.

### Adding demos
