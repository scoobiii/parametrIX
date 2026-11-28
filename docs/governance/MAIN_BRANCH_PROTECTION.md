# Main branch protection — ParametrIX

**Status:** implementation guide; GitHub repository ruleset still requires an administrator to enable it in repository settings.
**Target:** `refs/heads/main`
**Policy owner:** repository maintainers
**Last reviewed:** 2026-11-27

## Security objective

All changes to `main` must arrive through a reviewed pull request and pass the repository's mandatory CI gate. Direct pushes, force pushes, and branch deletion must be blocked. A merged PR is the auditable change record.

## Required GitHub Ruleset

Create an active repository ruleset at **Settings → Rules → Rulesets → New branch ruleset**.

- Ruleset name: `protect-main`
- Enforcement status: **Active**
- Target branches: include pattern `main`
- Bypass list: **empty** (do not grant a standing bypass to administrators, apps, or actors)
- Require a pull request before merging: **enabled**
- Required status checks: **enabled**, add the CI job check after confirming its exact displayed context on a PR run. The workflow job is named `ci-gate`; GitHub may display a workflow-qualified context.
- Require conversation resolution: **enabled**
- Require linear history: **enabled** (use squash merge as the repository's standard merge method)
- Block force pushes: **enabled**
- Restrict deletions: **enabled**

### Approval policy

Do not configure an approval count that makes the repository impossible to merge into when only one maintainer is available. If at least one independent reviewer is active, require **1 approval**, dismiss stale approvals when new commits are pushed, and require approval of the most recent reviewable push by someone other than the author. If no independent reviewer exists yet, keep the required approval count at **0** until a second reviewer is formally added; the PR requirement and mandatory CI remain enforced. Never treat the PR author as their own independent reviewer.

## Required check identification

The workflow is `.github/workflows/ci.yml`; the job is explicitly named `ci-gate`. Open a test PR and inspect its **Checks** tab. Select the exact check context GitHub reports for that job in the ruleset. Do not guess the context string and do not mark a check as optional. The CI workflow currently runs lint, 100% coverage thresholds, CAD audit, production build, and VUC proof generation.

## Repository-side controls

- CI workflow declares `permissions: contents: read` at workflow scope.
- CI uses the safe `pull_request` event; do not replace it with `pull_request_target` to run untrusted PR code with privileged tokens.
- Workflows that publish Pages or modify releases must declare only the permissions they need, at job scope where practical.
- Protect workflow files, security policy, proof/crypto code, and release automation with independent review when a second reviewer is available.
- Keep Actions dependencies updated and pin third-party actions to verified full commit SHAs as a separate hardening task; do not copy unverified SHAs.
- Review GitHub Actions settings so workflows from forks do not receive write tokens or secrets.

## Operational verification

After activating the ruleset, verify all of the following with a disposable test PR:

1. A direct push to `main` is rejected.
2. A force push to `main` is rejected.
3. Deletion of `main` is rejected.
4. A PR cannot merge while the required CI check is pending or failing.
5. A PR cannot merge until required conversations are resolved.
6. The configured approval policy behaves as intended.
7. No bypass actor is configured.

Record screenshots or API evidence of the active ruleset and test results in the security audit trail. Do not mark this control as implemented until those checks pass.

## Current known gap at the time this guide was added

The repository API reported `main` as `protected: false` and no repository rulesets. The GitHub integration available to this automation can read rulesets but does not have permission to create or edit repository rulesets. Therefore, this document and the CI hardening can be proposed in a PR, but they do **not** activate branch protection by themselves. An administrator must complete the Settings operation above.
