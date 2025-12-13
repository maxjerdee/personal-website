# Script to convert markdown files, themselves converted from .tex files by for example
# pandoc -s statistical_physics.tex -o statistical_physics.md
# Into Quarto markdown files in the style of my website.

# Steps to carry out:
# Before running, load all of the referenced figures as .svg files into the figure directory.
# Replace .pdf extensions with .svg in the markdown file.

# Next, redefine any macros used in the .tex file into LaTeX that Quarto can understand.
# Manually change equation labels, Ex: \label{eq:BT-win-probability} -> {#eq-BT-win-probability}
# But put the new label outside the equation block.

import re
import os
from svgpathtools import svg2paths, Path

# input_file = "statistical_physics.md"
# output_file = "statistical_physics_test.qmd"
# figures_dir = "../../assets/images/notes/statistical_physics"

# preamble = """
# ---
# title: "Statistical physics review"
# description: "Foundations of statistical physics from energy to entropy, and how they relate to model inference"
# categories:
#   - Physics
#   - Inference
# date: last-modified
# bibliography: ../../assets/LaTeX/references.bib
# assets-folder: "../../assets/images/notes/statistical_physics"
# image: ../../assets/images/notes/information_theory/statistical-physics.svg
# # include-in-header:
# #     - file: ../../assets/LaTeX/preamble.tex
# ---
# """


# input_file = "information_theory.md"
# output_file = "information_theory_test.qmd"
# figures_dir = "../../assets/images/notes/information_theory"

# preamble = ""

# input_file = "machine_learning.md"
# output_file = "machine_learning_test.qmd"
# figures_dir = "../../assets/images/notes/machine_learning"

# preamble = ""

# input_file = "network_structures.md"
# output_file = "network_structures_test.qmd"
# figures_dir = "../../assets/images/notes/network_structures"

# preamble = ""

# input_file = "stochastic_block_model.md"
# output_file = "stochastic_block_model.qmd"
# figures_dir = "../../assets/images/notes/stochastic_block_model"

# preamble = ""

# input_file = "erdos_renyi.md"
# output_file = "erdos_renyi.qmd"
# figures_dir = "../../assets/images/notes/erdos_renyi"

# preamble = ""

input_file = "depth_of_hierarchies.md"
output_file = "depth_of_hierarchies.qmd"
figures_dir = "../../assets/images/notes/depth_of_hierarchies"

preamble = ""

px_per_inch = 60  # Assuming 60 DPI for conversion

# Compute the pixels per inch squared

# Read the input file
with open(input_file, 'r', encoding='utf-8') as file:
    content = file.read()

    # Figures ################

    # Replace .pdf extensions with .svg in the markdown file.
    # For example, (max_dissertation//chapters//figures//chp1/coin-flip-ensemble.svg)
    # becomes ({{< meta assets-folder >}}/coin-flip-fair.svg)
    # re that matches to the pattern (.*.svg), but no parens inside
    for match in re.findall(r'\([^\(]*\.pdf\)', content):
        # Extract the filename without the .pdf extension
        basename = match.split('/')[-1][:-5]
        content = re.sub(match, '{{< meta assets-folder >}}/'+basename+'.svg', content)
        print(basename)

        # Read the width of the SVG file
        svg_file = os.path.join(figures_dir, basename + '.svg')
        paths, attributes = svg2paths(svg_file)

        # Combine all paths into a single Path object
        combined_path = Path(*[segment for p in paths for segment in p._segments])
        # print(paths)

        # Find height, width
        xmin, xmax, ymin, ymax =combined_path.bbox()
        width = xmax - xmin
        
        # Replace all the figure reference definitions to dashed format and add width
        # {#fig:coin-flip-ensemble} -> {#fig-coin-flip-ensemble width=4in} 
        content = re.sub(r'\{#fig:' + re.escape(basename) + r'\}', 
                         '{#fig-' + basename + ' width=' + str(width/px_per_inch) + 'in}', content)
        # Replace the references to the figures. For example,
        # Figure [3](#fig:coin-flip-entropy){reference-type="ref"
        # reference="fig:coin-flip-entropy"}
        # -> [Figure @fig-coin-flip-entropy]
        content = re.sub(r'Figure\s+\[(\d+)\]\(#fig:' + re.escape(basename) + r'\)\{[^\}]*\}', 
                         '[Figure @fig-' + basename + ']', content)
    
    # Equations ################
    # Surround equations with a style so that they do not overflow the page. For example,'
    # $$\begin{aligned}
    # H(\vec{s}) = \sum_{i=1}^n \left(0 \delta_{s_i 0} + 1 \delta_{s_i 1}\right) = n_H. \label{eq:coin-flip-energy}\end{aligned}$$
    # becomes
    # 
    # :::{style="overflow-x:auto;overflow-y:hidden;"}
    # $$\begin{aligned}
    # H(\vec{s}) = \sum_{i=1}^n \left(0 \delta_{s_i 0} + 1 \delta_{s_i 1}\right) = n_H. \label{eq:coin-flip-energy}
    # \end{aligned}$$ {#eq-coin-flip-fair-likelihood}
    # :::
    # Including the new line before the equation and the label change.
    content = re.sub(r'\$\$(.*?)\$\$', r'\n\n:::{style="overflow-x:auto;overflow-y:hidden;"}\n$$\1$$\n:::\n', content, flags=re.DOTALL)

    print(re.findall(r'\\label\{eq:([^\}]+)\}', content))
    for match in re.findall(r'\\label\{eq:([^\}]+)\}', content):
        # TODO: Pull the \label out of the equation and put it in the end of the equation block.
        print(match)
        print(re.findall(r'Eq\.\s+.*\(#eq:' + re.escape(match) + r'\)\{[^\}]*\}', content))
        content = re.sub(r'Eq\.\s+.*\(#eq:' + re.escape(match) + r'\)\{[^\}]*\}', 
                         '[Eq. @eq-' + match + ']', content)

    # Equation references
    # Eq. [\[eq:probability-entropy\]](#eq:probability-entropy){reference-type="eqref"
    # reference="eq:probability-entropy"}
    # becomes
    # [Eq. @eq-probability-entropy]
    content = re.sub(r'Eq\.\s+\[(\d+)\]\(#eq:([^\)]+)\)\{[^\}]*\}', r'[Eq. @eq-\2]', content)

    # Replace \vec with \boldsymbol
    content = re.sub(r'\\vec\{([^\}]+)\}', r'\\boldsymbol{\1}', content)

    # Replace \mat with \boldsymbol
    content = re.sub(r'\\mat\{([^\}]+)\}', r'\\boldsymbol{\1}', content)

    # Prepend the content with the preamble
    content = preamble + content

    # Write the modified content to the output file
    with open(output_file, 'w', encoding='utf-8') as output:
        output.write(content)
        print(f"Converted {input_file} to {output_file} with figures in {figures_dir}.")