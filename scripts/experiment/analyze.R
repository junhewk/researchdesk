# Pre-registered analysis for the persona-vs-context review factorial.
#
#   Rscript scripts/experiment/analyze.R
#
# Reads the long-format JSONL written by scripts/experiment/judge.ts and fits the
# mixed-effects models named in the plan. FREEZE this file (and the hypotheses)
# BEFORE generating any reviews — it is the pre-registration of the analysis.
#
# Deps: jsonlite, lme4 (glmmTMB optional for the count models).

suppressPackageStartupMessages({
  library(jsonlite)
  library(lme4)
})

root <- "experiments/manuscript-review"
gold <- stream_in(file(file.path(root, "gold_obs.jsonl")), verbose = FALSE)
item <- stream_in(file(file.path(root, "item_obs.jsonl")), verbose = FALSE)

# Derive the two factors from the arm label.
factorial_arms <- c("naive", "persona", "context", "persona_context")
add_factors <- function(df) {
  df$personaA <- as.integer(df$arm %in% c("persona", "persona_context"))
  df$contextB <- as.integer(df$arm %in% c("context", "persona_context"))
  df
}
gold <- add_factors(gold)
item <- add_factors(item)

or_ci <- function(model) {
  est <- fixef(model)
  se <- sqrt(diag(vcov(model)))
  data.frame(
    term = names(est),
    OR = round(exp(est), 3),
    lo = round(exp(est - 1.96 * se), 3),
    hi = round(exp(est + 1.96 * se), 3)
  )
}

cat("\n================ H1/H2/H3: PRIMARY — gate-layer recall ================\n")
# detected ~ personaA * contextB + (1|manuscript) + (1|gold) + (1|rep)
g_primary <- subset(gold, layer == "gate" & arm %in% factorial_arms)
if (nrow(g_primary) > 0 && length(unique(g_primary$arm)) >= 2) {
  m_primary <- glmer(
    detected ~ personaA * contextB + (1 | manuscriptId) + (1 | gold_id) + (1 | rep),
    data = g_primary, family = binomial,
    control = glmerControl(optimizer = "bobyqa")
  )
  print(summary(m_primary)$coefficients)
  cat("\nOdds ratios (95% CI):\n"); print(or_ci(m_primary))
  cat("\nReading: personaA main effect ~1 (CI spanning 1) supports H2 (persona adds nothing);",
      "\ncontextB OR > 1 supports H1; personaA:contextB ~1 supports H3.\n")
} else {
  cat("Not enough gate-layer data yet. Generate + judge more runs.\n")
}

cat("\n================ H1: hallucination (item level) ================\n")
i_fac <- subset(item, arm %in% factorial_arms)
if (nrow(i_fac) > 0 && length(unique(i_fac$arm)) >= 2) {
  m_halluc <- glmer(
    hallucination ~ personaA * contextB + (1 | manuscriptId) + (1 | rep),
    data = i_fac, family = binomial,
    control = glmerControl(optimizer = "bobyqa")
  )
  cat("\nOdds ratios (95% CI):\n"); print(or_ci(m_halluc))
  cat("\nReading: contextB OR < 1 supports H1 (grounding fabricates less);",
      "\npersonaA OR >= 1 supports H2 (persona fabricates at least as much).\n")
} else {
  cat("Not enough item-level data yet.\n")
}

cat("\n================ H4: persona == ensembling? ================\n")
# Compare persona vs identical-ensemble at matched call budget, within each
# context setting. If the persona coefficient ~ 0, persona framing adds nothing
# beyond running N reviewers + a merge.
h4 <- function(persona_arm, ensemble_arm, label) {
  d <- subset(gold, layer == "gate" & arm %in% c(persona_arm, ensemble_arm))
  if (nrow(d) == 0 || length(unique(d$arm)) < 2) { cat(label, ": insufficient data\n"); return(invisible()) }
  d$is_persona <- as.integer(d$arm == persona_arm)
  m <- glmer(detected ~ is_persona + (1 | manuscriptId) + (1 | gold_id) + (1 | rep),
             data = d, family = binomial, control = glmerControl(optimizer = "bobyqa"))
  cat("\n", label, " (is_persona OR; ~1 => persona == ensemble):\n", sep = "")
  print(or_ci(m)[2, ])
}
h4("persona", "ensemble_naive", "context OFF")
h4("persona_context", "ensemble_context", "context ON")

cat("\nDone. Unblind arm labels only after these models are fit.\n")
