# ADR 0005: A session report is one self-contained HTML file

- **Status:** accepted (Phase 4 spec, approved 12 November 2026)
- **Date:** 12 November 2026
- **Deciders:** Kevin Siu, Hui Siu Hin

## Context

Phase 4 exports one document per session that a stranger can read without the dashboard. The roadmap requires the export format to be settled before implementation. The report must link each finding to the events behind it, show gaps explicitly, and be deterministic: no statement that cannot be traced to a stored event or a rule.

Kevin chose the format, and how the report is produced, on 12 November 2026.

## Decision

A report is a single HTML file.

- **Self-contained.** All styling is inline in one `<style>` element. The file has no `<script>`, no external stylesheet, font or image, and no URL that the browser would fetch. It opens from disk with no network and no running service.
- **Links are anchors.** Each event has an `id` in the file. A finding links to its events with `#` anchors, so the links work offline.
- **Printable.** A print stylesheet in the same `<style>` element lets the browser save the report as PDF. TraceVault produces no PDF itself.
- **Deterministic.** The same stored events and the same rule files produce the same bytes. The report carries no generation time. It names the rule-set digest, so a reader can tell which rules judged the session.
- **One renderer, two entry points.** `tracevault report <session-id> --db <path> --out <file>` and the session page's "Export report" link both call the same view, so they produce identical bytes.
- **No new dependency.** The report is rendered by TypeScript in `src/dashboard/`, as the pages are.

## Consequences

- A reader needs only a browser.
- The report holds the same data as the session page, including the stored command text and paths. Sharing a report shares that data. Redaction of command text is still not implemented (Phase 1 known limitation).
- Interactive features of the session page (filters, replay, live updates) are not in the report.

## Alternatives rejected

- **Markdown.** Easy to read and diff, but anchors to events and the event table render differently in every viewer, and a long timeline is hard to follow.
- **PDF produced by TraceVault.** The most formal, but it needs a headless browser or a PDF library: a heavy dependency for what the browser's print already does.
- **JSON export.** Complete and machine-readable, but not readable by a stranger, which is the Phase 4 exit criterion.
