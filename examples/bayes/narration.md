# Narration: Bayes' theorem

## Bayes' theorem {#s-6na6br}
[0] Bayes' theorem tells us how to update a belief when new evidence arrives. We will see it at work in a simple spam filter. All the numbers are made up.

## A mail says "free". Is it spam? {#s-flkppm}
[0] Here is a question. A new mail arrives, and it contains the word "free". How likely is it to be spam? Take a guess.
[1] {note:Ask for a show of hands here.}In one class, sixteen people said about ninety percent. Five said fifty, and three said ten.
[2] The answer is about fifty percent. It is a coin toss. Let us see why.
[concl] To answer, we need two things: how common spam is in the first place, and how the word behaves.

## Before reading: 1 in 5 mails is spam {#s-d4puqk}
[0] Start with an inbox of one thousand mails.
[1] Two hundred of them are spam.
[2] The other eight hundred are ordinary mail.
[concl] So before we read a single word, the chance that a mail is spam is one in five. This is called the prior.

## Count the mails that contain "free" {#s-lau64p}
[0] Now look at the word. "Free" shows up in forty percent of spam. But it also shows up in ten percent of ordinary mail.
[1] Of the two hundred spam mails, eighty contain "free".
[2] Of the eight hundred other mails, ten percent is also eighty.
[concl] So one hundred and sixty mails contain "free", and only eighty of them are spam. That is one in two. Ordinary mail is so common that its ten percent adds up.

## The same count, written as a formula {#s-acgvdz}
[0] Bayes' theorem writes this same count as a formula.
[1] The chance of spam given the word is {mark:lik}the chance of the word in spam, times {mark:pri}the prior chance of spam, divided by {mark:evi}the overall chance of seeing the word.
[2] Each part has a name. The chance of the word in spam is the likelihood, zero point four. The chance of spam before reading is the prior, zero point two. And the overall chance of the word is the evidence. It counts "free" in both places, in spam and in other mail, which gives zero point one six.
[3] So the answer is zero point four times zero point two, divided by zero point one six. That is zero point five, the same as our count.
[concl] In words: the posterior is the likelihood, times the prior, divided by the evidence.

## One word at a time {#s-cudl2c}
[0] A filter does not stop at one word. Each posterior becomes the prior for the next word.
[1] Before reading anything, the chance of spam is twenty percent.
[2] The word "free" is four times more common in spam. That lifts the chance to fifty percent.
[3] Then comes "winner", which is twenty times more common in spam. Now the chance is ninety-five percent.
[concl] Each piece of evidence moves the belief a step: from twenty, to fifty, to ninety-five percent.

## Prior, evidence, posterior {#s-in5zgm}
[0] Let us put the pieces together.
[1] We start from the prior: how common spam is.
[2] We weigh it by the evidence: how much more common the word is in spam than in other mail.
[3] What comes out is the posterior, our updated belief.
[4] Going word by word like this assumes the words appear independently of each other. Filters built this way are called naive Bayes filters.
[concl] Never judge the evidence on its own. Always start from the prior.
