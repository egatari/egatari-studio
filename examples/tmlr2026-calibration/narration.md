# Narration: TMLR 2026 introduction video (single speaker)

## cover
[0] This video introduces our paper, A Theoretical Analysis of Bayes-Optimal Calibration under the Logit-Noise Model, published in Transactions on Machine Learning Research.

## confident
[0] Modern classifiers are often overconfident.
[1] When such a model says ninety percent, it may be right only about eighty percent of the time. On a reliability diagram, the curve bends away from the diagonal.
[2] The standard fix is temperature scaling. We divide the logit by a single number, T, fitted on held-out data.
[3] It works remarkably well. But why should one parameter be enough?
[concl] In this paper, we give a generative answer.

## question
[0] Here is the question.
[1] Under what generative model does temperature scaling approximate the Bayes-optimal correction?
[2] Not just a good heuristic, but an approximation to the optimal fix under squared error.
[3] And if it is, what determines the temperature?
[concl] Our answer is Gaussian noise in logit space, together with a flat prior.

## model
[0] We start from a simple model.
[1] {mark:theta-star}Each input has a true logit, theta star: the log-odds of the true class probability.
[2] {mark:eps}The classifier does not see it exactly. Its logit is the true logit plus Gaussian noise, with scale tau.
[3] {mark:sig}The sigmoid then turns this noisy logit into the predicted probability.
[concl] This is the assumption everything else builds on.

## overconfidence
[0] What does this noise do to calibration?
[1] With no noise, predictions are perfectly calibrated, and the curve lies on the diagonal.
[2] As tau grows, extreme predictions become less trustworthy, {cue}and the curve bends into the familiar inverse-S shape.
[concl] Logit noise naturally produces overconfidence.

## inverse
[0] This turns calibration into an inverse problem.
[1] Going forward, noise moves the true logit to the observed one, and the sigmoid gives the prediction.
[2] To undo this, we infer the true logit from what we observe, and average the sigmoid over that belief.
[3] {mark:C|box}Under squared error, the best correction is the posterior mean of the true probability, given the prediction.
[concl] In short, the optimal correction is a posterior mean.

## theorem
[0] With a Gaussian prior on the true logit, this posterior mean has a clean form.
[1] {mark:post}The optimal correction is a sigmoid, averaged over a Gaussian posterior, whose parameters are available in closed form.
[2] Why does this shrink predictions? Because the sigmoid is curved. {cue}Averaging it over our uncertainty pulls the result back from the extremes.
[concl] Noise plus curvature means shrinkage.

## ts
[0] Now comes a classical trick.
[1] MacKay's approximation turns the averaged sigmoid into a single sigmoid with a rescaled argument.
[2] {mark:T}With a flat prior, it takes exactly the form of temperature scaling, with T equal to the square root of one plus pi tau squared over eight.
[3] Here is the exact correction, and its temperature-scaling approximation, for a small tau.
[4] As tau grows, T grows with it,
[5] and even for large noise, the two curves stay within about one and a half percentage points of each other.
[concl] So, under a flat prior, the Bayes-optimal correction takes the form of temperature scaling.

## platt
[0] With a general Gaussian prior, the same approximation gives Platt scaling, with a slope A and an offset B.
[1] {mark:A}The slope A is always smaller than one over T, which is smaller than one. So the slope always contracts, and temperature scaling is the flat-prior limit, with no offset.
[concl] It is Platt scaling, with a slope that always contracts.

## synthetic
[0] We first test the theory where the assumption holds by construction.
[1] Before correction, the predictions follow the inverse-S curve that the theory predicts.
[2] After temperature scaling with the theoretical temperature, {cue}they move close to the diagonal.
[3] And across four noise levels, the temperature fitted from labels agrees with the theoretical value within one point four percent.
[concl] When the model holds, theory and practice agree.

## learner
[0] Real learners are messier.
[1] For a logistic regression model, the residuals are centered near zero, with the expected spread.
[2] But the Q-Q plot shows {cue}heavy tails, and closer diagnostics reveal four departures: a mean and a variance that depend on the true logit, heavy tails, and a rank dependence.
[concl] The theory also tells us what to check.

## breaks
[0] The theory also explains where temperature scaling fails.
[1] When the classes overlap, for example at variance one in our main setting, it lowers the calibration error.
[2] But as the classes separate, the assumption breaks down, and the classifier becomes underconfident. {cue}Temperature scaling with the noise-derived temperature then backfires.
[3] At variance zero point one, the calibration error climbs to zero point one six eight, more than ten times the uncorrected error.
[concl] A temperature derived from noise can only shrink predictions. It can never stretch them.

## takeaways
[0] To summarize.
[1] Under logit noise, the optimal correction is a sigmoid averaged over a Gaussian posterior.
[2] Under a flat prior, its MacKay approximation takes the form of temperature scaling, with an explicit temperature.
[3] And the theory explains when a noise-derived temperature works, and when it cannot.
[4] Our analysis covers binary classification, and our experiments assume the true logit is known. Estimating tau from real data is left for future work.

## links
[0] The paper and the code are available online. Thank you for watching.
