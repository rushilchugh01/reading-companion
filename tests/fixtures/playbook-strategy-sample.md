# Escalation Playbook

When a retrieval job fails, first compare the error class with the retry budget. Transient network
timeouts should consume local retries before escalation because the downstream queue often recovers
within one cycle. Validation errors should not retry blindly; they usually mean the input contract or
schema mapping changed.

If the retry budget is exhausted and the user-facing result is stale, route the job to manual review.
This tradeoff favors correctness over speed: a delayed answer is safer than presenting a confident
answer from the wrong page state. The main failure mode is over-escalation when local recovery signals
are ignored.
