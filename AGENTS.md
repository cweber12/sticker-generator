## Agent conventions

### Before changing anything

Read `docs/v2-plan.md`. It is the spec for this repo, and `.github/copilot-instructions.md`
summarises the rules that follow from it. The single most important one: the
image is the record, and size/type are axes of a request, not properties of a
sticker.

### After every completed task

Commit your changes before finishing the task. Use the commit message format
defined in `.github/copilot-instructions.md`.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `cweber12/sticker-generator`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
