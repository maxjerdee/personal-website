In the previous sections, we explored perspectives on *unsupervised*
machine learning tasks, which aim to understand a data set in isolation
without guidance or predefined outcomes. For instance, we can infer the
probability of heads from a sequence of coin flips or deduce the group
structure from a network using only the pattern of connections. We also
discussed how measures like Bayesian evidence or description length
assess the quality of our model in an information-theoretic manner that
is intrinsic to the data.

After extracting these inferences, we can leverage and evaluate them
beyond the scope of the initial data set. One application is to
*predict* future events; for example, in a college football network of
match outcomes, we might predict the winner between two teams that did
not compete during the regular season. Additionally, we may *validate*
our inferences against expert knowledge or existing context, or compare
the outputs of different models applied to the same data set. Machine
learning offers a variety of tools to address these practical purposes.

If we assume that the same mechanisms that generated our observed data
also inform unobserved outcomes, we can leverage our model inferences to
make predictions. For example, if we observe a coin and are convinced it
is fair, we may predict that future flips of the coin will land heads
and tails with equal probability. This extrapolation may or may not be
accurate. In machine learning terminology, we initially *fit* the model
to the \"training\" data and then assess the quality of the resulting
predictions using a \"testing\" data set.

In our coin flip example, we may split the sequence $\vec{s}$ we observe
into a training set $\vec{s}^{\text{train}}$ of $n^{\text{train}}$ flips
and testing set $\vec{s}^{\text{test}}$ of $n^{\text{test}}$ flips.
Figure [\[fig:coin-flip-perspectives\]](#fig:coin-flip-perspectives){reference-type="ref"
reference="fig:coin-flip-perspectives"}d provides a schematic of this
*cross-validation* set up. After fitting the model to the training data
we obtain the posterior distribution of the probability $p$, represented
as $P(p|\vec{s}^{\text{train}})$, which is maximized by the best fit
$$\begin{aligned}
    \hat{p}_{\text{MAP}}^{\text{train}} = \frac{n_H^{\text{train}} + 20}{n^{\text{train}} + 40}\end{aligned}$$
as in
Eq.[\[eq:coin-flip-p-MAP\]](#eq:coin-flip-p-MAP){reference-type="eqref"
reference="eq:coin-flip-p-MAP"}. Assuming the withheld testing
data $\vec{s}^{\text{test}}$ is governed by the same
parameter $\hat{p}_{\text{MAP}}^{\text{train}}$ as the *training* data,
we can evaluate the likelihood
Eq. [\[eq:coin-flip-likelihood\]](#eq:coin-flip-likelihood){reference-type="eqref"
reference="eq:coin-flip-likelihood"} on the *testing* data
$$\begin{aligned}
P(\vec{s}^{\text{test}}|\hat{p}_{\text{MAP}}^{\text{train}}) = \left(\frac{n_H^{\text{train}} + 20}{n^{\text{train}} + 40}\right)^{n_H^{\text{test}}}\left(\frac{n_T^{\text{train}} + 20}{n^{\text{train}} + 40}\right)^{n_T^{\text{test}}}. \label{eq:log-likelihood-cross-validation}\end{aligned}$$
This serves as a measure of the model's out-of-sample predictive
performance.

While most cross-validation tests use the single best parameter, we can
instead use the full posterior distribution of possible parameters to
compute the *posterior predictive* $$\begin{aligned}
    P(\vec{s}^{\text{test}}|\vec{s}^{\text{train}}) &= \int P(\vec{s}^{\text{test}}|p)P(p|\vec{s}^{\text{train}}) dp \nonumber \\
    &= \frac{(n^{\text{train}} + 41)!(n_H + 20)!(n_T + 20)!}{(n + 41)!(n_H^{\text{train}} + 20)!(n_H^{\text{train}} + 20)!}.\end{aligned}$$
This distribution is equal to the probability that the model generates
the data $\vec{s}^{\text{test}}$ conditioned on it also
generating $\vec{s}^{\text{train}}$.

In a cross validation context, the initial data set $\vec{s}$ is
randomly split into the training and testing data sets, often at a 80/20
ratio. The predictive performance of the model is quantified using
either the likelihood or posterior predictive. In keeping with the
information theoretic interpretation
Eq. [\[eq:H-log-P-information\]](#eq:H-log-P-information){reference-type="eqref"
reference="eq:H-log-P-information"}, we typically report the negative
log likelihood or posterior predictive as $$\begin{aligned}
    \langle H(\vec{s}^{\text{test}}|\hat{p}_{\text{MAP}}^{\text{train}})\rangle_{\vec{s}^{\text{test}},\vec{s}^{\text{train}}} &= \langle -\log P(\vec{s}^{\text{test}}|\hat{p}_{\text{MAP}}^{\text{train}})\rangle_{\vec{s}^{\text{test}},\vec{s}^{\text{train}}},
    \nonumber \\
    \langle H(\vec{s}^{\text{test}}|\vec{s}^{\text{train}})\rangle_{\vec{s}^{\text{test}},\vec{s}^{\text{train}}} &= \langle -\log P(\vec{s}^{\text{test}}|\vec{s}^{\text{train}})\rangle_{\vec{s}^{\text{test}},\vec{s}^{\text{train}}}, \label{eq:log-posterior-predictive-cross-validation}\end{aligned}$$
where the results are averaged over many possible validation
splits $\vec{s}^{\text{train}},\vec{s}^{\text{test}}$. In practice the
likelihood and posterior predictive can give different results, but we
will generally prefer to use the latter to evaluate the full posterior
of possible parameter values.

The Bayesian evidence can also be viewed as a measure of predictive
performance, averaged over various data splits. We can write out our
data set $\vec{s}$ as the sequence of coin flips $s_1,...,s_n$. Bayesian
evidence is the probability that the model generates this entire
sequence. Meanwhile, the posterior predictive is the probability that
the model generates some new piece of data given what it has already
generated. By sampling the posterior predictive one coin flip at a time,
we can therefore *sequentially* generate the full sequence.

We start by sampling the first flip $s_1$, which is equally likely *a
priori* to be heads or tails. This outcome informs the next coin flip,
drawn according to the posterior predictive $P(s_2|s_1)$. This repeats
until the final coin is predicted using all preceding results
using $P(s_n|s_{n-1},...,s_1)$. By definition of the posterior
predictive, the overall probability of generating any given sequence of
observations must then equal the Bayesian evidence as $$\begin{aligned}
    P(\vec{s}) &= P(s_n,s_{n-1},...,s_1) \nonumber \\
    &= P(s_n|s_{n-1},...,s_1)...P(s_2|s_1)P(s_1).\end{aligned}$$ From
the logarithm of this equation, the description length of the data is
the sum over the log-posterior-predictives at each step:
$$\begin{aligned}
    H(\vec{s}) = H(s_n|s_{n-1},...,s_1) + ... + H(s_2|s_1) + H(s_1).\end{aligned}$$
This relationship holds regardless of the order in which the coin flips
are considered. Therefore, the normalized description length is also
equal to a suitably defined average $$\begin{aligned}
    \frac{1}{n}H(\vec{s}) = \langle H(s_i|\vec{s}^{\text{train}})\rangle_{i,\vec{s}^{\text{train}}}\end{aligned}$$
over all possible subsets of training data and choices of single
withheld test point $s_i$ [@FH20].

We can thus use the Bayesian evidence not only as an information
theoretic measure for model selection, but also as an indicator of
overall predictive power. However, in keeping with much of the machine
learning literature we will often report cross-validation results using
the log-likelihood
Eq. [\[eq:log-likelihood-cross-validation\]](#eq:log-likelihood-cross-validation){reference-type="eqref"
reference="eq:log-likelihood-cross-validation"} and
log-posterior-predictive
Eq. [\[eq:log-posterior-predictive-cross-validation\]](#eq:log-posterior-predictive-cross-validation){reference-type="eqref"
reference="eq:log-posterior-predictive-cross-validation"} in this
thesis.

Beyond prediction, we would often like to assess the quality of the
inferred parameters directly. If we know from an artificial or empirical
context that a parameter truly has a certain value, how does our
inferred value compare? One way to establish such a \"true\" parameter
value is in a *synthetic* test where we first draw a true value of the
parameter $p^{\text{true}}$ from the prior $P(p)$. We then sample an
artificial data set $\vec{s}$ from the model
likelihood $P(\vec{s}|p^{\text{true}})$. Based solely on the resulting
data $\vec{s}$, we then infer the parameter $p$ and compare it to the
underlying $p^{\text{true}}$.

In this Bayesian setting, the posterior $P(p|\vec{s})$ is by definition
precisely the distribution of the parameters $p$ that could have
resulted in the observation $\vec{s}$. Thus, the full posterior
distribution gives a complete and optimal description of the truth.
Compared to this benchmark, synthetic tests provide valuable test cases
to understand deviations in the inferences. For example, we can examine
how inferences differ when models are misspecified and do not align with
the actual generative process. Understanding this robustness is crucial
when applying models to real data, where they very likely do not match
the real generative process.

Even when we consider the posterior of the true model, we may observe
how point estimate summaries differ from the true value. Depending on
how we quantify the distance between the inference $\hat{p}$ and the
truth $p^{\text{true}}$, different point estimates may be appropriate.
If we define success as only when we get the parameter exactly right
(using a \"one-hot\" metric), we should report the MAP estimate since it
maximizes this posterior probability. However, if we aim to minimize the
squared error ($\ell_2$ metric) of our inference, we should report the
expected a posteriori (EAP) value, which provides the least squares
estimate over the posterior. Thus even in the idealized scenario where
the data is generated by model, our choice of metric over the parameters
influences how we should summarize the inference, either with the mode
or the mean of the posterior.

While we can optimize our point estimates accordingly, the posterior
distribution can often be highly dispersed or even multimodal. This
means that, given the data, multiple parameter values may fit equally
well. The true parameter could reside at any of these peaks, meaning
that no single point estimate can reliably be close to the truth. Many
inference problems undergo a transition between a noisy regime where it
is not possible to consistently identify the generating parameters to a
data-rich regime where it becomes feasible.
Section [\[sec:SBM\]](#sec:SBM){reference-type="ref"
reference="sec:SBM"} discusses such an example in the context of finding
group structures in networks, which corresponds to the phase transition
of the Ising model at its critical temperature.

In this thesis, we will employ synthetic tests, cross-validation, and
parameter metrics to better understand the performance of our network
models. Applying these validation frameworks to networks presents unique
challenges. For instance, when examining the group structure of a
network, we need to evaluate the quality of group identity parameters.
Unlike the real probability $p$ of coin flips, there is no inherent
notion of \"distance\" or \"mean\" among group labelings, which are
categorical variables, to facilitate comparison.

In Chapter [\[chp:information\]](#chp:information){reference-type="ref"
reference="chp:information"} we discuss information-theoretic measures
to assess the similarity between two such clusterings of the same set of
objects. We then apply this measure in synthetic tests to observe the
relative performance of commonly used algorithms to recover the ground
truth groups used to generate the network. In this picture we also
observe regimes or types of group structure where all algorithms
struggle to recover the truth.

The projects considered in this work involve ideas borrowed from the
disciplines discussed in all of these Appendices, often in ways that do
not cleanly separate into a single category. In
Figure [\[fig:network-perspectives\]](#fig:network-perspectives){reference-type="ref"
reference="fig:network-perspectives"} we have illustrated schematics of
these applications across the thesis.
