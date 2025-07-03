## Max Jerdee's personal website

Hosted at [maxjerdee.com](https://www.maxjerdee.com/)

Built with the [quarto framework](https://quarto.org/)

Special categories for the notes posts are roughly supposed to be:
Paper explainer: informal explanation of a paper that we have put out, ideally accompanied by some sort of video explaination
Demo explainer: explanation of some technical details behind the inner workings of a demo

Otherwise I imagine that most of the posts will be explanations of some idea that comes up in my research or something I am generally curious about that has the developed demos embedded within the explanations. 

### Development details
In order to run the site locally, you will need to have quarto installed. You can install it by following the instructions at [quarto.org/docs/get-started/](https://quarto.org/docs/get-started/).
To run the site locally, you can use the following command:

```bash
quarto preview
```
in the `quarto_src` directory. This will start a local serve and give a link to view the site in your browser.

In order to build and host the site, run `quarto render` in the `quarto_src` directory. This will build the site and output it to the `docs` directory, which is where GitHub Pages will serve the site from. Then push to the `main` branch of the repository. GitHub Pages will automatically build and host the site from the `docs` directory.