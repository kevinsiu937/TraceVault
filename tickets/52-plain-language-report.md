# 52 — A report anyone can read

**What to build:** Kevin read the first exit-run report on 12 Nov 2026 and asked for a report someone with no IT background can follow. Every rule file gains a required `title` in plain words, and its explanation and recommendation are rewritten in plain words, with a developer hint in parentheses. The report opens with "In short", uses plain words for event kinds, results, severities and times, groups configuration findings by rule with every agent they apply to, labels evidence as examples, and ends with a glossary.

**Blocked by:** 48, 49. Found by the ticket 51 exit run.

**Status:** done

- [x] A rule without `title` fails to load and the error names the file (Seam C, both loaders)
- [x] Every finding carries a non-empty title (Seam C loops)
- [x] The report opens with an "In short" summary (Seam A)
- [x] Each risk shows its plain title and severity word, and keeps its rule id in small print (Seam A)
- [x] A configuration rule that applies to several agents appears once, naming them all, with examples marked as examples (Seam A)
- [x] Event kinds and results are in everyday words, and a glossary explains the remaining terms (Seam A)
- [x] A refused action reads "tried to …, but was refused", and a finding whose only actions were skipped is listed once, under skipped actions (Seam A)
- [x] Each risk shows only its title, severity, who it applies to and the plain advice; "Explain more" holds the rest, and the full record, technical details and glossary are folded (Seam A)
- [x] Clean layout from the ui-ux-pro-max guidance: status list, one card per risk, severity in words and colour, readable column; checked by screenshot at 900px and 600px
- [x] The dashboard keeps its technical layout; it shows the new plain explanations and recommendations
- [x] Typecheck, build and the full suite pass
- [x] Kevin has read the new report and confirms it can be followed (12 Nov 2026: "easy to follow")

**Technical notes:** `PlainWords` holds the report's vocabulary. The report is split into `ReportView`, `ReportFindingsView`, `ReportConfigurationView` and `ReportEventsView`, each under 200 lines.
