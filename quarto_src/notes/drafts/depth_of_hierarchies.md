## Bradley-Terry model {#sec:BT-model}

In the last section we discussed how the stochastic block model can be
used to understand group structures in networks. In this section we
describe how the Bradley-Terry model offers a similar perspective on
hierarchies, such as those described in
Section [\[sec:hierarchy-structure\]](#sec:hierarchy-structure){reference-type="ref"
reference="sec:hierarchy-structure"}. By modeling these hierarchies we
will be able to infer the rankings of the participants and predict the
outcomes of unobserved matches. In this section we will also introduce a
novel generalization of this model that allows us to directly infer the
strength of these hierarchies.

Before describing the full Bradley-Terry model, we can first define
hierarchies in terms of an objective function, just as the modularity
intuitively describes the quality of a group structure. Many observers
of such systems, especially in sports, may come to their own, often
quite different conclusions about the appropriate ranking of the
competitors. Out of these possibilities, it is useful to have a
consistent benchmark for what constitutes a \"good\" or \"fair\" ranking
given the results.

A natural starting point is to ask that a ranking is consistent with the
observations in the following sense: the favorite, the higher ranked
player, should typically win the match. To analyze a ranking in this
way, we first specify it as vector $\vec{s}$ where player $i$ is
assigned score $s_i$, and player $i$ is considered better than
player $j$ in the ranking if they have a higher score, $s_i > s_j$. In
this notation, we can then count up the number of times that the
favorite indeed wins as $$\begin{align}
    \mWin(\mat{A},\vec{s}) = \sum_{ij} A_{ij} \mathbf{1} \{s_i < s_j\}.
\end{align}$$ We note that the adjacency matrix $\mat{A}$ is asymmetric
in this definition since we are now describing a directed network.

In lieu of a known rating of the participants, we can then define a
ranking by maximizing the number of times the favorite indeed wins as
$$\begin{align}
    \vec{s}* = \text{argmax}_{\vec{s}} \mWin(\mat{A},\vec{s}).
\end{align}$$ This strategy is known as *minimum violation ranking*
since it is equivalent to minimizing the number of upset wins, or
\"violations\" of the ranking. It is computationally demanding to find
the true optimal ranking in this sense, and heuristic algorithms are
often employed [@CCP23].

We can also use the number of favorite wins $\mWin$ as a test statistic
to establish the presence of a hierarchy in the same manner as the
modularity demonstrates group structure. As a null hypothesis, we use a
\"fair coin\" model that either team is equally likely to prevail in any
given match regardless of their ranking. As an example, we can ask
whether there is significant evidence of a hierarchy present in the
pattern of football victories in the 2022 season Big Ten
conference [@Football22], or if the outcomes could be just as well
explained by coin flips. Figure [1](#fig:MVR){reference-type="ref"
reference="fig:MVR"}a plots this network with arrows pointing from the
winner to the loser of each match and the 14 teams vertically arranged
according to the minimum violation ranking. In this
hierarchy, $\mWin = 57$ of the $m = 64$ total matches are won by the
favored team (highlighted in green).

![College football matches played in the 2022 Big Ten conference
football season. (a) Arrows represent that one team beat another, teams
are vertically arranged to minimize the number of upset victories (in
red). (b) Arrows indicate that one team hosts another. Teams are
vertically positioned to minimize ranking violations. (c) The number of
times the favorite \"wins\" in each context, beating or hosting, are
compared against 10,000 simulations where outcomes are sampled as fair
coin
flips.](max_dissertation//chapters//figures//chp1/MVR.pdf){#fig:MVR}

In Figure [1](#fig:MVR){reference-type="ref" reference="fig:MVR"}c this
mark is compared against we could expect if each match was pure chance.
In the fair coin model, the favorite wins half the time for an average
of $\mWin = 32$. However due to random fluctuations the favorites may
happen to accumulate more wins than expected. Across the 10,000 plotted
samples, however, in no simulation did the favorite win more
than $\mWin = 47$ matches. Since this is far from the number observed
within the football hierarchy, we can reject the fair coin model and
conclude that genuine gaps in skill are driving the match outcomes.

In Figure [1](#fig:MVR){reference-type="ref" reference="fig:MVR"}b we
plot another network of the very same matches within the conference, but
now where a \"win\" indicates that one team hosted the other rather than
beat them. Intuitively we might expect this interaction to not be
strongly driven by a hierarchy among the teams, but rather be more akin
to the coin flip model. Yet, if again identify the minimum violations
ranking, we can construct an ordering of the teams where the favorite
wins $m_{\text{win}} = 45$ times. Returning to the significance testing,
in only 8 of the 10,000 simulations did random flips generate more
favorite wins than this mark for a p-value $P < 0.001$. In isolation
this would be seen as very strong evidence of our found hierarchy,
although since this ranking is chosen among $14! = 87178291200$ possible
orderings, the low p-value may not be as impressive as it first appears.

In order to establish that a hierarchy is present in a more intrinsic
manner, and to make predictions (e.g. who will win the next game?) we
will again turn to generative models. Particularly, we consider the
Bradley-Terry model, named after the work of R. Bradley and M. Terry who
described it in 1952 [@BT52], although it was (unknown to them) first
introduced much earlier, by Zermelo in 1929 [@Zermelo29]. In the model,
the probability $p_{ij}$ that node $i$ beats node $j$ is assumed to
depend upon the difference $s_i - s_j$ between their scores.
Specifically, the win probability is taken to be a logistic sigmoid
function of this difference as $$\begin{align}
    p_{ij} = \frac{1}{1 + e^{-(s_i - s_j)}}. \label{eq:BT-win-probability}
\end{align}$$

![Win probability $p_{ij}$ as a function of score difference $s_i - s_j$
in the Bradley-Terry model as in
Eq. [\[eq:BT-win-probability\]](#eq:BT-win-probability){reference-type="eqref"
reference="eq:BT-win-probability"}.](max_dissertation//chapters//figures//chp1/BT-curve.pdf){#fig:BT-curve}

This function, plotted in Figure [2](#fig:BT-curve){reference-type="ref"
reference="fig:BT-curve"}, has a number of intuitive properties. If the
two participants are evenly matched, $s_i = s_j$, $p_{ij} = 1/2$ and
each competitor is equally likely to prevail. If node $i$ is
considerably better than node $j$, $s_i \gg s_j$, they are very likely
to win as $p_{ij} \rightarrow 1$. Conversely if they are thoroughly
outmatched and $s_i \ll s_j$, node $i$ is unlikely to win
as $p_{ij} \rightarrow 0$. This *score function* also critically assigns
a behavioral meaning to a particular score differential. If node $i$ is
one \"unit\" above node $j$ in the hierarchy, they will win with
probability $$\begin{align}
    p_{ij} = \frac{1}{1 + e^{-1}} \approx 0.731.
\end{align}$$ This gap then defines the meaning of a \"tier\" or
\"level\" of skill differential, a difference that leads the favorite to
win roughly 70-75% of the time.

Compiling these win probabilities across all of the matches then yields
the Bradley-Terry model likelihood $$\begin{align}
    P(\mat{A}|\vec{s}) = \prod_{ij} p_{ij}^{A_{ij}} = \prod_{ij} \left(\frac{1}{1 + e^{-(s_i - s_j)}}\right)^{A_{ij}}.
\end{align}$$ Most treatments of this model directly infer the
maximum-likelihood values of the scores, although this approach can be
prone to overfitting. In this thesis we instead consider a Bayesian
treatment of the Bradley-Terry model, and find that this perspective
gives insight to the nature of the hierarchies considered.

Particularly, on each score $s_i$ we introduce an independent Gaussian
prior of width $\beta/\sqrt{2}$ for parameter $\beta > 0$,
$$\begin{align}
    P(\vec{s}|\beta) = \prod_{i=1}^n \frac{1}{\beta\sqrt{\pi}} e^{-s^2/\beta^2}. \label{eq:P-s-given-beta}
\end{align}$$ This choice is made so that the distribution of the
*differences* in scores $s_i - s_j$ follow a Gaussian distribution of
width $\beta$. The $\beta$ parameter therefore controls the typical
difference in score between two random nodes. Given the meaning of one
unit of score difference, $\beta$ counts how many layers of skill or
status are present in the hierarchy between the typical pair. With this
interpretation, we define this parameter in
Chapter [\[chp:hierarchies\]](#chp:hierarchies){reference-type="ref"
reference="chp:hierarchies"} as the *depth of competition* [@JN24].

![Example generative process for the Bradley-Terry model of hierarchies.
(a) The depth $\beta$ is first fixed, then the scores $\vec{s}$ are
sampled from a Gaussian of that width, represented by the vertical
distribution with width $\beta = 3$. The differences of these scores
then inform who wins each match, where the higher score participant is
favored. (b) This same process starting with a depth of $\beta = 1$.
This smaller depth leads to smaller differences in scores and so more
upset wins, colored in
red.](max_dissertation//chapters//figures//chp1/BT-generation.pdf){#fig:BT-generation}

Starting with a half-Cauchy prior
Eq. [\[eq:Pbeta\]](#eq:Pbeta){reference-type="eqref"
reference="eq:Pbeta"} over the depth,
Figure [3](#fig:BT-generation){reference-type="ref"
reference="fig:BT-generation"} demonstrates the full generative process
in the Bradley-Terry model.
Figure [3](#fig:BT-generation){reference-type="ref"
reference="fig:BT-generation"}a shows an example where the
depth $\beta = 3$ is relatively high. Since the typical difference
between scores is large, most matches are won by the favorite. In
contrast, Figure [3](#fig:BT-generation){reference-type="ref"
reference="fig:BT-generation"}b illustrates a lower depth of $\beta = 1$
where the now smaller score differences lead to more upsets --
violations of the ranking. From this perspective we also notice that if
the depth is $\beta = 0$ all of the scores must be the same and so all
matches are even, recovering the fair coin null model considered
earlier.

Given a network $\mat{A}$ we can then take MCMC samples from the
posterior distribution of the scores $\vec{s}$ and the depth $\beta$,
$$\begin{align}
    P(\vec{s}, \beta|\mat{A}) = \frac{P(\mat{A}|\vec{s})P(\vec{s}|\beta)P(\beta)}{P(\mat{A})}.
\end{align}$$ In Figure [4](#fig:BT-posteriors){reference-type="ref"
reference="fig:BT-posteriors"} the resulting posterior distributions of
the depth for the football victories and football hosting data sets are
plotted. For the pattern of victories, we can infer a depth
of $\hat{\beta}_{\text{MAP}} \approx 1.9$ within the conference,
indicating that there are roughly 2 levels of play between a random pair
of teams. Particularly, the victories posterior clearly excludes the
case $\beta = 0$, indicating strong evidence for the hierarchy over the
fair coin model. On the other hand, the pattern of hosting among the
teams favors a depth of 0, indicating that hierarchical structure is not
present and that the fair coin model is more appropriate. These
conclusions are supported by direct computations of the description
length and predictive power in
Table [1](#tab:hierarchy-model-performances){reference-type="ref"
reference="tab:hierarchy-model-performances"}.

![Posterior distribution of the depth $\beta$ inferred by the general
Bradley-Terry in the football victories and football hosting data sets.
There is strong evidence of a hierarchical structure among the pattern
of victories, while the pattern of hosting does not exclude the
possibility that outcomes are fully random, highlighted
at $\beta = 0$.](max_dissertation//chapters//figures//chp1/BT-posteriors.pdf){#fig:BT-posteriors}

::: {#tab:hierarchy-model-performances}
+----------------------------+------------------------------+-----------------------------+
| Data set                   | Football wins                | Football hosting            |
+:===========================+:=========:+:================:+:================:+:========:+
| Model                      | Fair coin | B-T              | Fair coin        | B-T      |
+----------------------------+-----------+------------------+------------------+----------+
| $\hat{\beta}_{\text{MAP}}$ | N/A       | $1.92$           | N/A              | $0$      |
+----------------------------+-----------+------------------+------------------+----------+
| $H(\mat{A})$               | $64.00$   | $\mathbf{54.43}$ | $\mathbf{64.00}$ | $65.92$  |
+----------------------------+-----------+------------------+------------------+----------+
| $H(\Atest|\Atrain)$        | $12.93$   | $\mathbf{10.88}$ | $\mathbf{12.93}$ | $13.06$  |
+----------------------------+-----------+------------------+------------------+----------+

: Table of best the measured depth $\hat{\beta}_{\text{MAP}}$, Bayesian
evidence $H(\mat{A})$, and posterior-predictive $H(\Atest|\Atrain)$ for
the fair coin and Bradley-Terry (B-T) models on the football wins and
hosting data sets.
:::

In Chapter [\[chp:hierarchies\]](#chp:hierarchies){reference-type="ref"
reference="chp:hierarchies"}, we discuss how this model can be further
generalized to model a \"luck\" component of hierarchies where upsets
are possible even between competitors of very different status. This
generalization also includes the minimum violation ranking originally
considered in this section, allowing for a direct comparison of the two
ranking methods. In that chapter we also infer the depths of a variety
of different data sets, ranging from sports and games to human and
animal social hierarchies.
Figure [5](#fig:depth-comparison){reference-type="ref"
reference="fig:depth-comparison"} summarizes these results.

![Depths of hierarchies inferred by our model across various
applications. A depth of $\beta = 0$ corresponds to outcomes determined
by fair coin flips while higher values of $\beta$ indicate deeper,
stricter hierarchies. Full posterior distributions of $\beta$ for these
cases are given in
Figure [\[fig:parameter-posteriors\]](#fig:parameter-posteriors){reference-type="ref"
reference="fig:parameter-posteriors"}.](max_dissertation//chapters//figures//chp1/depth-comparison.pdf){#fig:depth-comparison}

The sports and games we consider in
Figure [5](#fig:depth-comparison){reference-type="ref"
reference="fig:depth-comparison"} -- highlighted in red -- vary in their
depth yet tend to have a low $\beta$ compared to other contexts. Human
social hierarchies (in green), such as patterns of friendships or of
faculty hiring between universities, have a deeper, steeper hierarchy
than these sports. And more than both these cases, we find that the
animal social hierarchies (in blue) are very strict, with exceedingly
large $\beta$ values in some cases. Although the model does not know the
source of a given network, whether it represents sports matches, human
or animal interactions, it consistently categories the examples by
measuring the depth of each context. With this ability to measure
properties like the inequality in a hierarchy in hand, we can start to
speculate and investigate what factors lead to these contrasting
effects. For example, sports leagues are designed to be competitive for
entertainment value, whereas social hierarchies are subject to no such
incentives. By considering all of these applications within a unified
model we can draw comparisons between them.
